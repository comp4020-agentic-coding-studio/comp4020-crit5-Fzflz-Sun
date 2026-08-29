// Minimal sound-effect layer, entirely observational: it watches GameState
// from one frame to the next and plays a cue when something crosses a
// threshold (ammo went down, an enemy started flashing, a door opened), so
// none of the actual game-rule modules (state.ts, combat.ts, enemies.ts,
// level.ts) need to know audio exists at all.
//
// Every new cue below (projectile-destroy, upgrade-select, brute-telegraph)
// reuses one of the same seven shipped files at a different playback rate
// instead of adding a new audio asset — kept well inside the perf budget's
// fixed audio-file allowlist.
//
// Browsers block audio (and start any AudioContext suspended) until a user
// gesture, so playback stays a no-op until unlockAudio() runs — main.ts wires
// that to the first keydown/touchstart/pointerdown. A missing or blocked file
// fails silently: the game is fully playable mute.
//
// Playback is Web Audio API, not HTMLAudioElement: fire's cooldown (0.28s,
// 0.21s under Rapid) is far shorter than fire.ogg's ~1.3s length, so sustained
// fire needs several real concurrent voices, each trimmed to a short clip —
// not one long HTMLAudioElement re-seeked (`currentTime = 0`) mid-playback,
// which is audibly wrong and was the actual cause of the sustained-fire
// audio stutter this file used to have. Each sound file is fetched and
// decoded to an AudioBuffer exactly once, cached for the session; every
// playSound() is a short-lived AudioBufferSourceNode, never a re-seek of
// something already playing. A constrained HTMLAudioElement fallback is used
// only when Web Audio itself is unavailable.
import type { GameState } from "./types";
import { isBruteTelegraphing } from "./enemies";
import {
  AUDIO_FIRE_CLIP_DURATION,
  AUDIO_FIRE_FADE_DURATION,
  AUDIO_MAX_ACTIVE_SOURCES_GLOBAL,
  AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND,
  AUDIO_MAX_EVENTS_PER_FRAME,
  AUDIO_VOICE_POOL_SIZE,
  PLAYER_HURT_MIN_REPLAY_INTERVAL,
} from "./constants";

const AUDIO_FILES = {
  fire: "audio/fire.ogg",
  enemyHit: "audio/enemy-hit.ogg",
  enemyDeath: "audio/enemy-death.ogg",
  playerHurt: "audio/player-hurt.ogg",
  pickupAmmo: "audio/pickup-ammo.ogg",
  pickupHealth: "audio/pickup-health.ogg",
  doorOpen: "audio/door-open.ogg",
} as const;

type SoundName = keyof typeof AUDIO_FILES;

// Generic "hit" flashes rank below the more meaningful cues (a real shot
// fired, taking damage, a kill) so that when more distinct sounds happen in
// one frame than AUDIO_MAX_EVENTS_PER_FRAME allows, it's the redundant hit
// flourish that gets dropped, never the higher-signal cue.
const SOUND_PRIORITY: Record<SoundName, number> = {
  fire: 2,
  playerHurt: 2,
  enemyDeath: 2,
  enemyHit: 1,
  pickupAmmo: 2,
  pickupHealth: 2,
  doorOpen: 2,
};

let unlocked = false;

function resolveAudioUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

function getAudioContextCtor(): (new () => AudioContext) | undefined {
  if (typeof AudioContext !== "undefined") return AudioContext;
  const globalWithWebkit = globalThis as unknown as { webkitAudioContext?: new () => AudioContext };
  return globalWithWebkit.webkitAudioContext;
}

type BufferState = AudioBuffer | "pending" | "failed";

interface WebAudioState {
  ctx: AudioContext;
  buffers: Map<SoundName, BufferState>;
  activeGlobal: Set<AudioBufferSourceNode>;
  activePerSound: Map<SoundName, Set<AudioBufferSourceNode>>;
}

let webAudio: WebAudioState | null = null;
let webAudioUnsupported = false;

function decodeAudioData(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return Promise.resolve(ctx.decodeAudioData(data));
}

/** Fetches+decodes a sound file exactly once per session — repeat calls
 * (from repeated unlockAudio()-style setup, in tests) are no-ops once an
 * entry already exists, whether it landed, failed, or is still in flight. */
function loadBuffer(state: WebAudioState, name: SoundName): void {
  if (state.buffers.has(name)) return;
  state.buffers.set(name, "pending");
  const url = resolveAudioUrl(AUDIO_FILES[name]);
  fetch(url)
    .then((res) => res.arrayBuffer())
    .then((data) => decodeAudioData(state.ctx, data))
    .then((buffer) => {
      state.buffers.set(name, buffer);
    })
    .catch(() => {
      // Missing/blocked/undecodable file: leave it permanently unplayable
      // rather than retrying forever or throwing into the game loop.
      state.buffers.set(name, "failed");
    });
}

function ensureWebAudio(): WebAudioState | null {
  if (webAudioUnsupported) return null;
  if (webAudio) return webAudio;

  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    webAudioUnsupported = true;
    return null;
  }

  try {
    const ctx = new Ctor();
    const state: WebAudioState = { ctx, buffers: new Map(), activeGlobal: new Set(), activePerSound: new Map() };
    webAudio = state;
    for (const name of Object.keys(AUDIO_FILES) as SoundName[]) loadBuffer(state, name);
    return state;
  } catch {
    webAudioUnsupported = true;
    return null;
  }
}

/** Call once, from the first keydown/touchstart/pointerdown — never before,
 * or the browser's autoplay policy silently drops every play() call. Also
 * where the shared AudioContext is created (and every sound file's decode
 * kicked off) exactly once per session, and where it's resumed if the
 * browser started it suspended. Safe to call more than once: a context is
 * never created twice, and files are never re-decoded. */
export function unlockAudio(): void {
  unlocked = true;
  const state = ensureWebAudio();
  if (state && state.ctx.state === "suspended") {
    void state.ctx.resume().catch(() => {
      // Will simply retry resuming on the next gesture-driven call.
    });
  }
}

function playWebAudioSound(state: WebAudioState, name: SoundName, playbackRate: number): void {
  const buffer = state.buffers.get(name);
  if (!buffer || buffer === "pending" || buffer === "failed") return; // not ready yet — skip silently, never block

  if (state.activeGlobal.size >= AUDIO_MAX_ACTIVE_SOURCES_GLOBAL) return;
  let perSound = state.activePerSound.get(name);
  if (!perSound) {
    perSound = new Set();
    state.activePerSound.set(name, perSound);
  }
  if (perSound.size >= AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND) return;

  const ctx = state.ctx;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;

  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  source.connect(gain);
  gain.connect(ctx.destination);

  const activeGlobal = state.activeGlobal;
  const activePerSound = perSound;
  const cleanup = (): void => {
    activeGlobal.delete(source);
    activePerSound.delete(source);
    try {
      source.disconnect();
    } catch {
      // Already disconnected (or never connected) — nothing to clean up.
    }
    try {
      gain.disconnect();
    } catch {
      // Already disconnected.
    }
  };
  source.onended = cleanup;

  activeGlobal.add(source);
  activePerSound.add(source);

  try {
    if (name === "fire") {
      // fire.ogg runs far longer than the fire interval, so sustained/Rapid
      // fire is trimmed to just its punchy onset via start()'s own duration
      // parameter, with the gain ramped to 0 just before that cutoff so it
      // never reads as an audible click.
      const fadeStart = Math.max(0, AUDIO_FIRE_CLIP_DURATION - AUDIO_FIRE_FADE_DURATION);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.setValueAtTime(0.5, now + fadeStart);
      gain.gain.linearRampToValueAtTime(0, now + AUDIO_FIRE_CLIP_DURATION);
      source.start(0, 0, AUDIO_FIRE_CLIP_DURATION);
    } else {
      source.start(0);
    }
  } catch {
    cleanup();
  }
}

// Constrained HTMLAudioElement fallback, used only when Web Audio itself is
// unavailable (webAudioUnsupported). Unlike the old implementation, a voice
// is only ever picked when paused/ended (never seeked out from under a
// currently-playing element), the cue is simply dropped when every voice in
// the pool is busy, and the pool never grows to absorb a burst.
const fallbackPools = new Map<SoundName, HTMLAudioElement[]>();

function getFallbackVoice(name: SoundName): HTMLAudioElement | null {
  let pool = fallbackPools.get(name);
  if (!pool) {
    pool = Array.from({ length: AUDIO_VOICE_POOL_SIZE }, () => new Audio(resolveAudioUrl(AUDIO_FILES[name])));
    fallbackPools.set(name, pool);
  }
  return pool.find((voice) => voice.paused || voice.ended) ?? null;
}

function playFallbackSound(name: SoundName, playbackRate: number): void {
  if (typeof document === "undefined" || typeof Audio === "undefined") return;
  const voice = getFallbackVoice(name);
  if (!voice) return; // every voice busy: drop rather than seek or grow the pool
  voice.currentTime = 0; // safe — only ever reached on a paused/ended voice
  voice.volume = 0.5;
  voice.playbackRate = playbackRate;
  voice.play().catch(() => {
    // Blocked or missing file — the game stays fully playable without sound.
  });
}

function playSoundNow(name: SoundName, playbackRate = 1): void {
  if (!unlocked) return;
  if (webAudio) {
    playWebAudioSound(webAudio, name, playbackRate);
    return;
  }
  if (webAudioUnsupported) playFallbackSound(name, playbackRate);
}

function countUpgrades(state: GameState): number {
  return Object.values(state.upgrades).filter(Boolean).length;
}

interface AudioSnapshot {
  ammo: number;
  hurtEventId: number;
  // state.elapsed at the last actually-played playerHurt cue, so a burst of
  // hurtEventId bumps within one throttle window plays at most one sound —
  // defense-in-depth alongside the cooldown that already limits how often
  // contact damage itself can fire an event.
  lastHurtPlayedAt: number;
  elapsed: number;
  enemyFlash: Map<number, boolean>;
  enemyAlive: Map<number, boolean>;
  bruteTelegraph: Map<number, boolean>;
  pickupCollected: Map<number, boolean>;
  doorOpen: boolean[];
  projectilesDestroyed: number;
  upgradesCount: number;
  multiplier: number;
}

/** Fills (or refills) the per-entity maps/array on an existing snapshot in
 * place — `.clear()` plus `.set()` reuses the same Map/array instances every
 * frame instead of the old `new Map(state.enemies.map(...))` pattern, which
 * allocated a fresh Map and a fresh intermediate array every single frame. */
function syncEntitySnapshot(snapshot: AudioSnapshot, state: GameState): void {
  snapshot.enemyFlash.clear();
  snapshot.enemyAlive.clear();
  snapshot.bruteTelegraph.clear();
  for (const enemy of state.enemies) {
    snapshot.enemyFlash.set(enemy.id, enemy.flashTimer > 0);
    snapshot.enemyAlive.set(enemy.id, enemy.alive);
    snapshot.bruteTelegraph.set(enemy.id, isBruteTelegraphing(enemy));
  }

  snapshot.pickupCollected.clear();
  for (const pickup of state.pickups) snapshot.pickupCollected.set(pickup.id, pickup.collected);

  snapshot.doorOpen.length = 0;
  for (const door of state.map.doors) snapshot.doorOpen.push(door.open);
}

export function createAudioSnapshot(state: GameState): AudioSnapshot {
  const snapshot: AudioSnapshot = {
    ammo: state.player.ammo,
    hurtEventId: state.hurtEventId,
    lastHurtPlayedAt: -Infinity,
    elapsed: state.elapsed,
    enemyFlash: new Map(),
    enemyAlive: new Map(),
    bruteTelegraph: new Map(),
    pickupCollected: new Map(),
    doorOpen: [],
    projectilesDestroyed: state.projectilesDestroyed,
    upgradesCount: countUpgrades(state),
    multiplier: state.multiplier,
  };
  syncEntitySnapshot(snapshot, state);
  return snapshot;
}

/** Compares `prev` against the just-updated `state` and plays a cue for every
 * event that happened this frame, then mutates `prev` in place into the
 * snapshot for next time (no new object, Maps, or arrays allocated on the
 * common path). Every check is a one-directional transition (false -> true,
 * or a decrease/counter-bump), and `state.elapsed` resetting below `prev`'s
 * — which only happens on restart, since it otherwise only ever counts up or
 * freezes at death — is caught explicitly up front and forces a full,
 * allocating resync so a restart's clean state (health/ammo back at their
 * starting values, `hurtEventId` back at 0) can never read as a spurious
 * wave of events.
 *
 * Every distinct sound *name* this frame is queued at most once (a Brute
 * telegraph and a normal enemyHit both landing this frame collapse into one
 * "enemyHit" cue instead of playing twice), and if more distinct names are
 * queued than AUDIO_MAX_EVENTS_PER_FRAME allows, the lowest-priority ones
 * (generic "hit") are the ones dropped — see SOUND_PRIORITY. */
export function playEventSounds(prev: AudioSnapshot, state: GameState): AudioSnapshot {
  if (state.elapsed < prev.elapsed) return createAudioSnapshot(state);

  const queued = new Map<SoundName, number>();
  const queue = (name: SoundName, rate = 1): void => {
    if (!queued.has(name)) queued.set(name, rate);
  };

  if (state.player.ammo < prev.ammo) queue("fire");

  if (state.hurtEventId !== prev.hurtEventId && state.elapsed - prev.lastHurtPlayedAt >= PLAYER_HURT_MIN_REPLAY_INTERVAL) {
    queue("playerHurt");
    prev.lastHurtPlayedAt = state.elapsed;
  }

  for (const enemy of state.enemies) {
    const wasFlashing = prev.enemyFlash.get(enemy.id) ?? false;
    if (!wasFlashing && enemy.flashTimer > 0) queue("enemyHit");

    const wasTelegraphing = prev.bruteTelegraph.get(enemy.id) ?? false;
    if (!wasTelegraphing && isBruteTelegraphing(enemy)) queue("enemyHit", 0.7);

    const wasAlive = prev.enemyAlive.get(enemy.id) ?? true;
    if (wasAlive && !enemy.alive) {
      // A longer kill streak pitches the death cue up slightly — an audible
      // sign the combo is climbing, without any new sound file.
      const rate = 1 + Math.min(0.5, (state.multiplier - 1) * 0.15);
      queue("enemyDeath", rate);
    }
  }

  for (const pickup of state.pickups) {
    const wasCollected = prev.pickupCollected.get(pickup.id) ?? false;
    if (!wasCollected && pickup.collected) queue(pickup.kind === "ammo" ? "pickupAmmo" : "pickupHealth");
  }

  if (state.map.doors.some((d, i) => d.open && !prev.doorOpen[i])) queue("doorOpen");
  if (state.projectilesDestroyed > prev.projectilesDestroyed) queue("enemyHit", 1.6);
  if (countUpgrades(state) > prev.upgradesCount) queue("doorOpen", 1.3);

  let toPlay = [...queued.entries()];
  if (toPlay.length > AUDIO_MAX_EVENTS_PER_FRAME) {
    toPlay = toPlay.sort((a, b) => SOUND_PRIORITY[b[0]] - SOUND_PRIORITY[a[0]]).slice(0, AUDIO_MAX_EVENTS_PER_FRAME);
  }
  for (const [name, rate] of toPlay) playSoundNow(name, rate);

  prev.ammo = state.player.ammo;
  prev.hurtEventId = state.hurtEventId;
  prev.elapsed = state.elapsed;
  prev.projectilesDestroyed = state.projectilesDestroyed;
  prev.upgradesCount = countUpgrades(state);
  prev.multiplier = state.multiplier;
  syncEntitySnapshot(prev, state);

  return prev;
}

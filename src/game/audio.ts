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
// Browsers block audio until a user gesture, so playback stays a no-op until
// unlockAudio() runs — main.ts wires that to the first keydown/touchstart.
// A missing or blocked file fails silently: the game is fully playable mute.
import type { GameState } from "./types";
import { isBruteTelegraphing } from "./enemies";
import { AUDIO_VOICE_POOL_SIZE, PLAYER_HURT_MIN_REPLAY_INTERVAL } from "./constants";

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

let unlocked = false;

function resolveAudioUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

/** Call once, from the first keydown/touchstart — never before, or the
 * browser's autoplay policy silently drops every play() call. */
export function unlockAudio(): void {
  unlocked = true;
}

// One fixed-size round-robin pool of HTMLAudioElements per sound, built lazily
// on first use and kept at module scope so it survives restarts untouched —
// a contact-damage storm (or anything else firing the same cue dozens of
// times a second) reuses these voices instead of constructing a fresh
// `new Audio()` (and its own decode/network machinery) on every single call.
const voicePools = new Map<SoundName, HTMLAudioElement[]>();
const voiceCursor = new Map<SoundName, number>();

function getNextVoice(name: SoundName): HTMLAudioElement {
  let pool = voicePools.get(name);
  if (!pool) {
    pool = Array.from({ length: AUDIO_VOICE_POOL_SIZE }, () => new Audio(resolveAudioUrl(AUDIO_FILES[name])));
    voicePools.set(name, pool);
    voiceCursor.set(name, 0);
  }
  const cursor = voiceCursor.get(name) ?? 0;
  voiceCursor.set(name, (cursor + 1) % pool.length);
  return pool[cursor]!;
}

function playSound(name: SoundName, playbackRate = 1): void {
  if (!unlocked || typeof document === "undefined" || typeof Audio === "undefined") return;
  const audio = getNextVoice(name);
  try {
    audio.currentTime = 0;
  } catch {
    // Not seekable yet (metadata still loading) — play() still starts fine.
  }
  audio.volume = 0.5;
  audio.playbackRate = playbackRate;
  audio.play().catch(() => {
    // Blocked or missing file — the game stays fully playable without sound.
  });
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

/** Compares `prev` against the just-updated `state`, plays a cue for every
 * event that happened this frame, and mutates `prev` in place into the
 * snapshot for next time (no new object, Maps, or arrays allocated on the
 * common path). Every check is a one-directional transition (false -> true,
 * or a decrease/counter-bump), and `state.elapsed` resetting below `prev`'s
 * — which only happens on restart, since it otherwise only ever counts up or
 * freezes at death — is caught explicitly up front and forces a full,
 * allocating resync so a restart's clean state (health/ammo back at their
 * starting values, `hurtEventId` back at 0) can never read as a spurious
 * wave of events. */
export function playEventSounds(prev: AudioSnapshot, state: GameState): AudioSnapshot {
  if (state.elapsed < prev.elapsed) return createAudioSnapshot(state);

  if (state.player.ammo < prev.ammo) playSound("fire");

  if (state.hurtEventId !== prev.hurtEventId && state.elapsed - prev.lastHurtPlayedAt >= PLAYER_HURT_MIN_REPLAY_INTERVAL) {
    playSound("playerHurt");
    prev.lastHurtPlayedAt = state.elapsed;
  }

  for (const enemy of state.enemies) {
    const wasFlashing = prev.enemyFlash.get(enemy.id) ?? false;
    if (!wasFlashing && enemy.flashTimer > 0) playSound("enemyHit");

    const wasTelegraphing = prev.bruteTelegraph.get(enemy.id) ?? false;
    if (!wasTelegraphing && isBruteTelegraphing(enemy)) playSound("enemyHit", 0.7);

    const wasAlive = prev.enemyAlive.get(enemy.id) ?? true;
    if (wasAlive && !enemy.alive) {
      // A longer kill streak pitches the death cue up slightly — an audible
      // sign the combo is climbing, without any new sound file.
      const rate = 1 + Math.min(0.5, (state.multiplier - 1) * 0.15);
      playSound("enemyDeath", rate);
    }
  }

  for (const pickup of state.pickups) {
    const wasCollected = prev.pickupCollected.get(pickup.id) ?? false;
    if (!wasCollected && pickup.collected) playSound(pickup.kind === "ammo" ? "pickupAmmo" : "pickupHealth");
  }

  if (state.map.doors.some((d, i) => d.open && !prev.doorOpen[i])) playSound("doorOpen");
  if (state.projectilesDestroyed > prev.projectilesDestroyed) playSound("enemyHit", 1.6);
  if (countUpgrades(state) > prev.upgradesCount) playSound("doorOpen", 1.3);

  prev.ammo = state.player.ammo;
  prev.hurtEventId = state.hurtEventId;
  prev.elapsed = state.elapsed;
  prev.projectilesDestroyed = state.projectilesDestroyed;
  prev.upgradesCount = countUpgrades(state);
  prev.multiplier = state.multiplier;
  syncEntitySnapshot(prev, state);

  return prev;
}

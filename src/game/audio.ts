// Minimal sound-effect layer, entirely observational: it watches GameState
// from one frame to the next and plays a cue when something crosses a
// threshold (ammo went down, an enemy started flashing, a door opened), so
// none of the actual game-rule modules (state.ts, combat.ts, enemies.ts,
// level.ts) need to know audio exists at all.
//
// Browsers block audio until a user gesture, so playback stays a no-op until
// unlockAudio() runs — main.ts wires that to the first keydown/touchstart.
// A missing or blocked file fails silently: the game is fully playable mute.
import type { GameState } from "./types";

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

function playSound(name: SoundName): void {
  if (!unlocked || typeof document === "undefined" || typeof Audio === "undefined") return;
  const audio = new Audio(resolveAudioUrl(AUDIO_FILES[name]));
  audio.volume = 0.5;
  audio.play().catch(() => {
    // Blocked or missing file — the game stays fully playable without sound.
  });
}

interface AudioSnapshot {
  ammo: number;
  health: number;
  enemyFlash: Map<number, boolean>;
  enemyAlive: Map<number, boolean>;
  pickupCollected: Map<number, boolean>;
  doorOpen: boolean[];
}

export function createAudioSnapshot(state: GameState): AudioSnapshot {
  return {
    ammo: state.player.ammo,
    health: state.player.health,
    enemyFlash: new Map(state.enemies.map((e) => [e.id, e.flashTimer > 0])),
    enemyAlive: new Map(state.enemies.map((e) => [e.id, e.alive])),
    pickupCollected: new Map(state.pickups.map((p) => [p.id, p.collected])),
    doorOpen: state.map.doors.map((d) => d.open),
  };
}

/** Compares `prev` against the just-updated `state`, plays a cue for every
 * event that happened this frame, and returns the new snapshot to pass in
 * next time. Every check is a one-directional transition (false -> true, or
 * a decrease), so a full state reset on restart — where values jump back to
 * their starting points rather than climbing through the old ones — never
 * triggers a spurious sound. */
export function playEventSounds(prev: AudioSnapshot, state: GameState): AudioSnapshot {
  if (state.player.ammo < prev.ammo) playSound("fire");
  if (state.player.health < prev.health) playSound("playerHurt");

  for (const enemy of state.enemies) {
    const wasFlashing = prev.enemyFlash.get(enemy.id) ?? false;
    if (!wasFlashing && enemy.flashTimer > 0) playSound("enemyHit");

    const wasAlive = prev.enemyAlive.get(enemy.id) ?? true;
    if (wasAlive && !enemy.alive) playSound("enemyDeath");
  }

  for (const pickup of state.pickups) {
    const wasCollected = prev.pickupCollected.get(pickup.id) ?? false;
    if (!wasCollected && pickup.collected) playSound(pickup.kind === "ammo" ? "pickupAmmo" : "pickupHealth");
  }

  if (state.map.doors.some((d, i) => d.open && !prev.doorOpen[i])) playSound("doorOpen");

  return createAudioSnapshot(state);
}

// The fight -> reward -> grow stronger -> harder fight -> results loop lives
// here. A tutorial kill unlocks the first upgrade choice, walking into Room B
// seals the gate behind the player and trickles out two waves, clearing them
// reopens the gate and offers the second choice, and Room C repeats that with
// two tougher waves before the exit counts as unlocked. Every stage
// transition is driven by plain state (enemies alive, player position,
// upgrade chosen) — no timers racing the player, nothing that can soft-lock.
import type { EncounterState, GameState, Pedestal, UpgradeKind, Vec2, WaveSpawnDef } from "./types";
import { isSolid, setGateOpen } from "./level";
import { spawnEnemy } from "./enemies";
import {
  COLOR_PEACH,
  ENEMY_RADIUS,
  HINT_DISPLAY_DURATION,
  MAX_SIMULTANEOUS_ENEMIES,
  PEDESTAL_SELECT_RADIUS,
  SPAWN_FALLBACK_OFFSETS,
  SPAWN_RETRY_DELAY,
  SPAWN_SAFE_ENEMY_DIST,
  SPAWN_SAFE_PLAYER_DIST,
  SPAWN_TELEGRAPH_DURATION,
  WAVE_PAUSE_DURATION,
} from "./constants";

export const WAVE_B1: WaveSpawnDef[] = [
  { kind: "grunt", pos: { x: 18, y: 2 } },
  { kind: "grunt", pos: { x: 24, y: 2 } },
  { kind: "scout", pos: { x: 18, y: 4 } },
];

export const WAVE_B2: WaveSpawnDef[] = [
  { kind: "grunt", pos: { x: 21, y: 2 } },
  { kind: "scout", pos: { x: 21, y: 6 } },
  { kind: "brute", pos: { x: 24, y: 6 } },
  { kind: "grunt", pos: { x: 18, y: 6 } },
];

export const WAVE_C1: WaveSpawnDef[] = [
  { kind: "grunt", pos: { x: 18, y: 12 } },
  { kind: "grunt", pos: { x: 24, y: 12 } },
  { kind: "scout", pos: { x: 18, y: 14 } },
  { kind: "scout", pos: { x: 18, y: 16 } },
];

export const WAVE_C2: WaveSpawnDef[] = [
  { kind: "grunt", pos: { x: 21, y: 12 } },
  { kind: "grunt", pos: { x: 24, y: 16 } },
  { kind: "scout", pos: { x: 24, y: 14 } },
  { kind: "brute", pos: { x: 21, y: 16 } },
];

export const PEDESTALS_1: Pedestal[] = [
  { id: 1, kind: "rapid", pos: { x: 4, y: 2 } },
  { id: 2, kind: "impact", pos: { x: 4, y: 6 } },
];

export const PEDESTALS_2: Pedestal[] = [
  { id: 3, kind: "pierce", pos: { x: 20, y: 3 } },
  { id: 4, kind: "salvage", pos: { x: 20, y: 5 } },
];

export const RANGED_ENEMY_HINT_TEXT = "Incoming shots can be destroyed — fire at them!";

export const UPGRADE_DESCRIPTIONS: Record<UpgradeKind, string> = {
  rapid: "RAPID: -25% fire cooldown",
  impact: "IMPACT: more damage, stronger knockback",
  pierce: "PIERCE: shots pass through the first enemy hit",
  salvage: "SALVAGE: bigger ammo & health drops from kills",
};

function clonePedestals(list: Pedestal[]): Pedestal[] {
  return list.map((p) => ({ ...p, pos: { ...p.pos } }));
}

function aliveCount(state: GameState): number {
  let n = 0;
  for (const e of state.enemies) if (e.alive) n++;
  return n;
}

/** True if a candidate spawn point is clear of walls, the player, and every
 * other alive enemy. Checked before an enemy is actually spawned so a wave
 * can never place one embedded in geometry or directly on top of the player
 * or another enemy. */
function isSpawnPositionSafe(state: GameState, pos: Vec2): boolean {
  const map = state.map;
  if (
    isSolid(map, pos.x, pos.y) ||
    isSolid(map, pos.x + ENEMY_RADIUS, pos.y) ||
    isSolid(map, pos.x - ENEMY_RADIUS, pos.y) ||
    isSolid(map, pos.x, pos.y + ENEMY_RADIUS) ||
    isSolid(map, pos.x, pos.y - ENEMY_RADIUS)
  ) {
    return false;
  }

  const dxp = pos.x - state.player.pos.x;
  const dyp = pos.y - state.player.pos.y;
  if (Math.hypot(dxp, dyp) < SPAWN_SAFE_PLAYER_DIST) return false;

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const dx = pos.x - enemy.pos.x;
    const dy = pos.y - enemy.pos.y;
    if (Math.hypot(dx, dy) < SPAWN_SAFE_ENEMY_DIST) return false;
  }

  return true;
}

/** Tries the intended spawn point, then a small fixed list of nearby
 * fallback offsets (never RNG, never unbounded retry) — returns the first
 * safe candidate, or null if every one of them is occupied right now. */
function findSafeSpawnPos(state: GameState, basePos: Vec2): Vec2 | null {
  for (const offset of SPAWN_FALLBACK_OFFSETS) {
    const candidate = { x: basePos.x + offset.x, y: basePos.y + offset.y };
    if (isSpawnPositionSafe(state, candidate)) return candidate;
  }
  return null;
}

function spawnTelegraphMarker(state: GameState, pos: { x: number; y: number }): void {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    state.particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(a) * 0.4, y: Math.sin(a) * 0.4 },
      ttl: SPAWN_TELEGRAPH_DURATION,
      maxTtl: SPAWN_TELEGRAPH_DURATION,
      color: COLOR_PEACH,
    });
  }
}

/** Trickles the current wave's queued spawns in as slots free up, so the
 * "max simultaneous enemies" cap holds even for a wave whose total size
 * exceeds it. Each spawn is telegraphed briefly before it actually appears. */
function updateWaveSpawning(state: GameState, dt: number): void {
  const enc = state.encounter;

  for (let i = enc.pending.length - 1; i >= 0; i--) {
    const p = enc.pending[i]!;
    p.telegraphTimer -= dt;
    if (p.telegraphTimer <= 0) {
      const safePos = findSafeSpawnPos(state, p.pos);
      if (!safePos) {
        // Every candidate is occupied right now — wait a short, fixed delay
        // and recheck next time, rather than spinning in place this frame or
        // retrying forever. The wave stays queued; it just spawns a beat late.
        p.telegraphTimer = SPAWN_RETRY_DELAY;
        continue;
      }
      const enemy = spawnEnemy(p.kind, safePos);
      state.enemies.push(enemy);
      enc.pending.splice(i, 1);
      if ((p.kind === "scout" || p.kind === "brute") && !state.hintShown) {
        state.hintShown = true;
        state.hintTimer = HINT_DISPLAY_DURATION;
      }
    }
  }

  if (aliveCount(state) + enc.pending.length < MAX_SIMULTANEOUS_ENEMIES && enc.waveQueue.length > 0) {
    const next = enc.waveQueue.shift()!;
    enc.pending.push({ ...next, telegraphTimer: SPAWN_TELEGRAPH_DURATION });
    spawnTelegraphMarker(state, next.pos);
  }
}

function waveCleared(state: GameState): boolean {
  const enc = state.encounter;
  return enc.waveQueue.length === 0 && enc.pending.length === 0 && aliveCount(state) === 0;
}

/** Runs one room's two-wave encounter: spawns/trickles wave `waveIndex`,
 * pauses briefly between waves, and calls `onCleared` once both are done. */
function updateRoomEncounter(state: GameState, dt: number, waves: [WaveSpawnDef[], WaveSpawnDef[]], onCleared: () => void): void {
  const enc = state.encounter;

  if (enc.pauseTimer > 0) {
    enc.pauseTimer = Math.max(0, enc.pauseTimer - dt);
    if (enc.pauseTimer === 0) {
      enc.waveIndex += 1;
      enc.waveQueue = [...waves[1]];
    }
    return;
  }

  updateWaveSpawning(state, dt);
  if (waveCleared(state)) {
    if (enc.waveIndex === 0) {
      enc.pauseTimer = WAVE_PAUSE_DURATION;
    } else {
      onCleared();
    }
  }
}

export function updateEncounter(state: GameState, dt: number): void {
  const enc: EncounterState = state.encounter;
  const p = state.player.pos;

  switch (enc.stage) {
    case "tutorial":
      if (aliveCount(state) === 0) {
        enc.stage = "upgrade1";
        state.pedestals = clonePedestals(PEDESTALS_1);
      }
      break;

    case "upgrade1":
      if (state.upgradeChoice1) enc.stage = "freeRoam";
      break;

    case "freeRoam":
      if (p.x >= 17.5) {
        setGateOpen(state.map, false);
        enc.stage = "roomB";
        enc.waveIndex = 0;
        enc.waveQueue = [...WAVE_B1];
      }
      break;

    case "roomB":
      updateRoomEncounter(state, dt, [WAVE_B1, WAVE_B2], () => {
        setGateOpen(state.map, true);
        enc.stage = "upgrade2";
        state.pedestals = clonePedestals(PEDESTALS_2);
      });
      break;

    case "upgrade2":
      if (state.upgradeChoice2) enc.stage = "freeRoamToC";
      break;

    case "freeRoamToC":
      if (p.y >= 11.5 && p.x >= 17 && p.x <= 26) {
        enc.stage = "roomC";
        enc.waveIndex = 0;
        enc.waveQueue = [...WAVE_C1];
      }
      break;

    case "roomC":
      updateRoomEncounter(state, dt, [WAVE_C1, WAVE_C2], () => {
        enc.stage = "done";
      });
      break;

    case "done":
      break;
  }
}

export function updatePedestals(state: GameState): void {
  if (state.pedestals.length === 0) return;
  const p = state.player.pos;
  for (const pedestal of state.pedestals) {
    const dist = Math.hypot(pedestal.pos.x - p.x, pedestal.pos.y - p.y);
    if (dist <= PEDESTAL_SELECT_RADIUS) {
      state.upgrades[pedestal.kind] = true;
      if (!state.upgradeChoice1) state.upgradeChoice1 = pedestal.kind;
      else if (!state.upgradeChoice2) state.upgradeChoice2 = pedestal.kind;
      state.pedestals = [];
      return;
    }
  }
}

// The Spawn Director (Section 4) and wave-phase timing (Section 3). This is
// the ONLY place new enemies enter state.enemies during a run — no fixed wave
// lists, no unbounded accumulation. Every wave has an explicit, small active-
// enemy cap (see WAVE_ACTIVE_CAP_TABLE); difficulty comes from spawn pacing
// and composition, never from raising that cap without bound or from raising
// enemy HP/damage per wave.
import type { DirectorState, Enemy, EnemyKind, GameState, SpawnAnchor, SpawnTelegraph, WaveState } from "./types";
import { spawnEnemy } from "./enemies";
import { isSolid } from "./level";
import { hasLineOfSight } from "./raycast";
import { rollUpgradeOptions } from "./upgrades";
import {
  BRUTE_TELEGRAPH_DURATION,
  DIRECTOR_RECENT_MEMORY,
  MAX_ACTIVE_ENEMIES_HARD_CEILING,
  SPAWN_ANCHOR_COOLDOWN,
  SPAWN_MIN_PLAYER_DIST,
  SPAWN_TELEGRAPH_DURATION,
  WAVE_ACTIVE_CAP_TABLE,
  WAVE_CLEANUP_HIDE_DESPAWN,
  WAVE_CLEANUP_MAX_DURATION,
  WAVE_COMBAT_DURATION,
  WAVE_RANGED_CAP,
  WAVE_SPAWN_INTERVAL_BASE,
  WAVE_SPAWN_INTERVAL_FLOOR,
  WAVE_SPAWN_INTERVAL_STEP,
} from "./constants";
import { rngInt } from "./rng";

export function createDirectorState(): DirectorState {
  return { anchorCooldowns: {}, recentAnchors: [], recentZoneIds: [] };
}

/** Bounded cyclic growth (Section 2): waves past the table's length reuse its
 * last entry, capped again by the hard ceiling — never indefinite scaling. */
function activeCapForWave(waveNumber: number): number {
  const idx = Math.min(waveNumber - 1, WAVE_ACTIVE_CAP_TABLE.length - 1);
  return Math.min(WAVE_ACTIVE_CAP_TABLE[Math.max(0, idx)]!, MAX_ACTIVE_ENEMIES_HARD_CEILING);
}

function spawnIntervalForWave(waveNumber: number): number {
  return Math.max(WAVE_SPAWN_INTERVAL_FLOOR, WAVE_SPAWN_INTERVAL_BASE - WAVE_SPAWN_INTERVAL_STEP * (waveNumber - 1));
}

export function createWaveState(): WaveState {
  return {
    number: 1,
    phase: "combat",
    timer: WAVE_COMBAT_DURATION,
    cleanupTimer: 0,
    activeCap: activeCapForWave(1),
    rangedCap: WAVE_RANGED_CAP,
    spawnInterval: spawnIntervalForWave(1),
    spawnTimer: spawnIntervalForWave(1),
  };
}

/** Starts a wave's combat phase fresh — called for wave 1 at run start, and
 * again after every upgrade pop-up's countdown finishes. */
export function beginWave(state: GameState, waveNumber: number): void {
  state.wave.number = waveNumber;
  state.wave.phase = "combat";
  state.wave.timer = WAVE_COMBAT_DURATION;
  state.wave.cleanupTimer = 0;
  state.wave.activeCap = activeCapForWave(waveNumber);
  state.wave.rangedCap = WAVE_RANGED_CAP;
  state.wave.spawnInterval = spawnIntervalForWave(waveNumber);
  state.wave.spawnTimer = state.wave.spawnInterval;
  // Fresh recency memory each wave — a spawn point used at the tail of the
  // last wave is fair game again at the start of the next.
  state.director.recentAnchors = [];
  state.director.recentZoneIds = [];
}

export function isRangedEnemyKind(kind: EnemyKind): boolean {
  return kind === "scout" || kind === "brute";
}

function countActiveByRanged(state: GameState): { total: number; ranged: number } {
  let total = 0;
  let ranged = 0;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    total += 1;
    if (isRangedEnemyKind(e.kind)) ranged += 1;
  }
  return { total, ranged };
}

/** Counts down every anchor's reuse cooldown by dt — a plain object keyed by
 * anchor id, bounded by the map's fixed (<=18) anchor count. */
function tickAnchorCooldowns(director: DirectorState, dt: number): void {
  for (const key of Object.keys(director.anchorCooldowns)) {
    const id = Number(key);
    const next = director.anchorCooldowns[id]! - dt;
    if (next <= 0) delete director.anchorCooldowns[id];
    else director.anchorCooldowns[id] = next;
  }
}

/** Picks the best-scoring valid anchor for a new spawn, or null if none of
 * the map's fixed anchors currently qualify. A single fixed pass over the
 * (<=18) anchors — never an unbounded search or while-loop. Rejects any
 * anchor that: is on cooldown, sits in a solid cell, is nearer than
 * SPAWN_MIN_PLAYER_DIST to the player, was used in the last
 * DIRECTOR_RECENT_MEMORY spawns, or is both visible to the player and close
 * enough that a telegraph wouldn't read as fair warning. */
export function pickSpawnAnchor(state: GameState): SpawnAnchor | null {
  const { map, player, director } = state;
  const candidates: SpawnAnchor[] = [];

  for (const anchor of map.anchors) {
    if (director.anchorCooldowns[anchor.id]) continue;
    if (isSolid(map, anchor.pos.x, anchor.pos.y)) continue;
    if (director.recentAnchors.includes(anchor.id)) continue;

    const dist = Math.hypot(anchor.pos.x - player.pos.x, anchor.pos.y - player.pos.y);
    if (dist < SPAWN_MIN_PLAYER_DIST) continue;

    const visible = hasLineOfSight(map, anchor.pos, player.pos);
    if (visible && dist < SPAWN_MIN_PLAYER_DIST + 3) continue;

    candidates.push(anchor);
  }

  if (candidates.length === 0) return null;

  // Zone diversity: prefer a zone not used in the last few spawns.
  const fresh = candidates.filter((a) => !director.recentZoneIds.includes(a.zoneId));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[rngInt(state.rng, pool.length)]!;
}

/** Composition mix shifts with wave number, capped at wave 5's mix (bounded
 * cyclic growth, Section 2) — never past that, and a ranged pick above the
 * current rangedCap silently downgrades to grunt rather than being spawned
 * over budget. */
function pickComposition(state: GameState, rangedActive: number): EnemyKind {
  const w = Math.min(state.wave.number, 5);
  const roll = rngInt(state.rng, 10);
  const rangedAllowed = rangedActive < state.wave.rangedCap;

  let kind: EnemyKind;
  if (w <= 1) kind = roll < 7 ? "grunt" : "scout";
  else if (w === 2) kind = roll < 5 ? "grunt" : roll < 8 ? "scout" : "brute";
  else if (w <= 4) kind = roll < 4 ? "grunt" : roll < 8 ? "scout" : "brute";
  else kind = roll < 3 ? "grunt" : roll < 7 ? "scout" : "brute";

  return isRangedEnemyKind(kind) && !rangedAllowed ? "grunt" : kind;
}

/** One Director attempt at a single spawn (never a batch) during the combat
 * phase: respects the active/ranged caps and anchor availability, then queues
 * a telegraph rather than an immediate Enemy — see resolveTelegraphs. */
function attemptSpawn(state: GameState): void {
  const { total, ranged } = countActiveByRanged(state);
  if (total >= state.wave.activeCap) return;

  const anchor = pickSpawnAnchor(state);
  if (!anchor) return;

  const kind = pickComposition(state, ranged);

  state.director.anchorCooldowns[anchor.id] = SPAWN_ANCHOR_COOLDOWN;
  state.director.recentAnchors.push(anchor.id);
  if (state.director.recentAnchors.length > DIRECTOR_RECENT_MEMORY) state.director.recentAnchors.shift();
  state.director.recentZoneIds.push(anchor.zoneId);
  if (state.director.recentZoneIds.length > DIRECTOR_RECENT_MEMORY) state.director.recentZoneIds.shift();

  state.nextId += 1;
  const telegraph: SpawnTelegraph = {
    id: state.nextId,
    kind,
    pos: { ...anchor.pos },
    timer: kind === "brute" ? BRUTE_TELEGRAPH_DURATION : SPAWN_TELEGRAPH_DURATION,
  };
  state.telegraphs.push(telegraph);
}

/** Counts down active telegraphs and, on expiry, pushes the real Enemy into
 * state.enemies. Bounded by state.telegraphs' own size, which only ever grows
 * one at a time from attemptSpawn. */
function resolveTelegraphs(state: GameState, dt: number): void {
  if (state.telegraphs.length === 0) return;
  const remaining: SpawnTelegraph[] = [];
  for (const t of state.telegraphs) {
    t.timer -= dt;
    if (t.timer > 0) {
      remaining.push(t);
      continue;
    }
    const enemy: Enemy = spawnEnemy(t.kind, t.pos);
    state.nextId += 1;
    enemy.id = state.nextId;
    state.enemies.push(enemy);
  }
  state.telegraphs = remaining;
}

/** Removes enemies whose post-death grace period has elapsed — the piece that
 * keeps state.enemies from growing without bound over an infinite run. Called
 * every frame regardless of wave phase. */
export function cleanupDeadEnemies(state: GameState, dt: number): void {
  if (state.enemies.length === 0) return;
  const survivors: Enemy[] = [];
  for (const e of state.enemies) {
    if (e.alive) {
      survivors.push(e);
      continue;
    }
    const grace = (e.deathTimer ?? 0) - dt;
    if (grace > 0) {
      e.deathTimer = grace;
      survivors.push(e);
    }
  }
  state.enemies = survivors;
}

/** Advances the wave/spawning state machine by one frame. Only called while
 * state.screen === "playing". Returns true when the wave just finished and
 * the caller should switch to the upgrade pop-up. */
export function updateWave(state: GameState, dt: number): boolean {
  tickAnchorCooldowns(state.director, dt);

  if (state.wave.phase === "combat") {
    state.wave.timer -= dt;
    state.wave.spawnTimer -= dt;
    if (state.wave.spawnTimer <= 0) {
      state.wave.spawnTimer = state.wave.spawnInterval;
      attemptSpawn(state);
    }
    resolveTelegraphs(state, dt);
    if (state.wave.timer <= 0) {
      state.wave.phase = "cleanup";
      state.wave.cleanupTimer = 0;
    }
    return false;
  }

  // Cleanup: no new spawns, but a telegraph already queued still resolves so
  // nothing vanishes mid-appear.
  resolveTelegraphs(state, dt);
  state.wave.cleanupTimer += dt;

  const activeCount = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const hidingTooLong = state.wave.cleanupTimer >= WAVE_CLEANUP_HIDE_DESPAWN;
  const hardCap = state.wave.cleanupTimer >= WAVE_CLEANUP_MAX_DURATION;

  if (activeCount === 0) return true;
  if (hidingTooLong || hardCap) {
    // Force-despawn stragglers with no kill credit — a hider that wouldn't
    // engage doesn't get to hold the wave open forever, but also isn't worth
    // score/drops for simply timing out.
    for (const e of state.enemies) if (e.alive) e.alive = false;
    state.telegraphs = [];
    return true;
  }
  return false;
}

/** Rolls the next wave's 3-choice upgrade menu — kept here (not inlined at
 * every call site) so state.ts's screen transition into "upgrade" is a single
 * call. */
export function openUpgradeMenu(state: GameState): void {
  state.upgradeOptions = rollUpgradeOptions(state);
}

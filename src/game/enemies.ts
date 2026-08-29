// Three enemy kinds, three distinct jobs — not three stat blocks. Grunt is a
// fast one-hit-kill melee chaser with no ranged attack at all; Scout kites at
// range and pokes with fast, low-damage shots; Brute is a slow route-blocker
// that telegraphs a heavier ranged attack before firing it. Difficulty comes
// from having to handle all three at once, not from raising any one's HP.
import type { Enemy, EnemyKind, GameState, LevelMap, Vec2 } from "./types";
import { moveWithCollision } from "./level";
import { hasLineOfSight } from "./raycast";
import { applyPlayerDamage } from "./combat";
import {
  CONTACT_DAMAGE_INTERVAL,
  ENEMY_ENEMY_MIN_DIST,
  ENEMY_RADIUS,
  PLAYER_ENEMY_MIN_DIST,
  SEPARATION_ITERATIONS,
} from "./constants";

interface EnemyDef {
  health: number;
  speed: number;
  damage: number;
  contactRadius: number;
  sightRange: number;
  fireInterval: number;
  projectileSpeed: number;
  projectileDamage: number;
  preferredRangeMin?: number;
  preferredRangeMax?: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  // 1 HP, fast, melee-only. No ranged attack of any kind — the threat is
  // purely "don't let it reach you," which reads instantly even at 1 HP.
  grunt: {
    health: 1,
    speed: 1.3,
    damage: 14,
    contactRadius: 0.55,
    sightRange: 9,
    fireInterval: Number.POSITIVE_INFINITY,
    projectileSpeed: 0,
    projectileDamage: 0,
  },
  // Maintains a preferred distance band instead of closing or fleeing
  // outright: backs off if the player gets close, closes in if the player
  // runs, holds and fires in between. Fast projectiles, low damage each.
  scout: {
    health: 2,
    speed: 1.1,
    damage: 4,
    contactRadius: 0.5,
    sightRange: 11,
    fireInterval: 1.5,
    projectileSpeed: 3.4,
    projectileDamage: 4,
    preferredRangeMin: 3.5,
    preferredRangeMax: 6.5,
  },
  // Slow and bulky: barely chases, mostly just blocks a route and threatens
  // anyone who lingers. Winds up visibly (see telegraphTimer/BRUTE_TELEGRAPH
  // _DURATION) before a low-frequency but high-damage shot, and its death is
  // meant to feel bigger than the other two kinds'.
  brute: {
    health: 4,
    speed: 0.55,
    damage: 16,
    contactRadius: 0.65,
    sightRange: 11,
    fireInterval: 3.6,
    projectileSpeed: 1.9,
    projectileDamage: 11,
  },
};

export function spawnEnemy(kind: EnemyKind, pos: Vec2, overrides: Partial<EnemyDef> = {}): Enemy {
  const def = { ...ENEMY_DEFS[kind], ...overrides };
  return {
    id: Math.floor(Math.random() * 1e9),
    kind,
    pos: { ...pos },
    health: def.health,
    maxHealth: def.health,
    alive: true,
    state: "idle",
    flashTimer: 0,
    fireCooldown: def.fireInterval,
    speed: def.speed,
    damage: def.damage,
    contactRadius: def.contactRadius,
    sightRange: def.sightRange,
    fireInterval: def.fireInterval,
    projectileSpeed: def.projectileSpeed,
    projectileDamage: def.projectileDamage,
    telegraphTimer: 0,
    preferredRangeMin: def.preferredRangeMin,
    preferredRangeMax: def.preferredRangeMax,
    contactCooldown: 0,
  };
}

/** Discrete, cooldown-gated contact damage: one lump of enemy.damage times
 * CONTACT_DAMAGE_INTERVAL when the cooldown elapses, instead of
 * enemy.damage*dt every single frame of overlap. Average DPS is unchanged;
 * what changes is that a sustained stall now produces one damage/audio event
 * every CONTACT_DAMAGE_INTERVAL seconds instead of ~60/sec. `+=` (not `=`)
 * so it self-corrects a small overshoot without ever needing an unbounded
 * catch-up loop — dt is already capped well under the interval by MAX_DT. */
function applyContactDamage(state: GameState, enemy: Enemy, dt: number): void {
  enemy.contactCooldown -= dt;
  if (enemy.contactCooldown > 0) return;
  enemy.contactCooldown += CONTACT_DAMAGE_INTERVAL;
  applyPlayerDamage(state, enemy.damage * CONTACT_DAMAGE_INTERVAL);
}

function fireProjectile(state: GameState, enemy: Enemy, dirX: number, dirY: number): void {
  state.nextId += 1;
  state.projectiles.push({
    id: state.nextId,
    pos: { x: enemy.pos.x, y: enemy.pos.y },
    vel: { x: dirX * enemy.projectileSpeed, y: dirY * enemy.projectileSpeed },
    ttl: 6,
    damage: enemy.projectileDamage,
  });
}

function updateGrunt(state: GameState, enemy: Enemy, dt: number, dist: number, nx: number, ny: number): void {
  if (dist > enemy.contactRadius) {
    const step = enemy.speed * dt;
    enemy.pos = moveWithCollision(state.map, enemy.pos, nx * step, ny * step, ENEMY_RADIUS);
  } else {
    applyContactDamage(state, enemy, dt);
  }
}

function updateScout(
  state: GameState,
  enemy: Enemy,
  dt: number,
  dist: number,
  nx: number,
  ny: number,
  canSeePlayer: boolean,
): void {
  const min = enemy.preferredRangeMin ?? 3.5;
  const max = enemy.preferredRangeMax ?? 6.5;
  // Contact is checked first: contactRadius is always well inside `min`, so
  // as a pure kiter a scout that's fled correctly never reaches it — but if
  // something (a corner, a crowd of enemies) pins it into contact range
  // anyway, that must still deal damage rather than being permanently
  // shadowed by the flee branch below.
  if (dist <= enemy.contactRadius) {
    applyContactDamage(state, enemy, dt);
  } else if (dist < min) {
    const step = enemy.speed * dt;
    enemy.pos = moveWithCollision(state.map, enemy.pos, -nx * step, -ny * step, ENEMY_RADIUS);
  } else if (dist > max) {
    const step = enemy.speed * dt;
    enemy.pos = moveWithCollision(state.map, enemy.pos, nx * step, ny * step, ENEMY_RADIUS);
  }

  enemy.fireCooldown -= dt;
  if (canSeePlayer && enemy.fireCooldown <= 0) {
    fireProjectile(state, enemy, nx, ny);
    enemy.fireCooldown = enemy.fireInterval;
  }
}

function updateBrute(
  state: GameState,
  enemy: Enemy,
  dt: number,
  dist: number,
  nx: number,
  ny: number,
  canSeePlayer: boolean,
  telegraphDuration: number,
): void {
  if (enemy.telegraphTimer > 0) {
    enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt);
    if (enemy.telegraphTimer === 0) {
      fireProjectile(state, enemy, nx, ny);
      enemy.fireCooldown = enemy.fireInterval;
    }
    return; // holds position mid wind-up — a route-blocker, not a chaser
  }

  if (dist > enemy.contactRadius) {
    const step = enemy.speed * dt;
    enemy.pos = moveWithCollision(state.map, enemy.pos, nx * step, ny * step, ENEMY_RADIUS);
  } else {
    applyContactDamage(state, enemy, dt);
  }

  enemy.fireCooldown -= dt;
  if (canSeePlayer && enemy.fireCooldown <= 0 && dist > enemy.contactRadius) {
    enemy.fireCooldown = enemy.fireInterval;
    enemy.telegraphTimer = telegraphDuration;
  }
}

export function isBruteTelegraphing(enemy: Enemy): boolean {
  return enemy.kind === "brute" && enemy.telegraphTimer > 0;
}

export function updateEnemies(state: GameState, dt: number, bruteTelegraphDuration: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.flashTimer > 0) enemy.flashTimer = Math.max(0, enemy.flashTimer - dt);

    const dx = state.player.pos.x - enemy.pos.x;
    const dy = state.player.pos.y - enemy.pos.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const nx = dx / dist;
    const ny = dy / dist;

    const canSeePlayer = dist <= enemy.sightRange && hasLineOfSight(state.map, enemy.pos, state.player.pos);
    if (canSeePlayer) enemy.state = "alert";
    if (enemy.state !== "alert") continue;

    if (enemy.kind === "scout") {
      updateScout(state, enemy, dt, dist, nx, ny, canSeePlayer);
    } else if (enemy.kind === "brute") {
      updateBrute(state, enemy, dt, dist, nx, ny, canSeePlayer, bruteTelegraphDuration);
    } else {
      updateGrunt(state, enemy, dt, dist, nx, ny);
    }
  }
}

/** A fixed, deterministic direction derived from an id — never random, so
 * tests are reproducible, and never (0,0). Used only as a fallback when two
 * circles are exactly coincident and a real separation direction can't be
 * computed from their (zero) relative position. The golden angle keeps
 * different ids spread around the circle instead of clustering. */
const GOLDEN_ANGLE = 2.399963229728653;
function fallbackDirection(seed: number): Vec2 {
  const angle = (Math.abs(seed) * GOLDEN_ANGLE) % (Math.PI * 2);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Pushes the enemy back out to at least `minDist` from a fixed point
 * (typically the player), respecting walls via moveWithCollision. Only the
 * enemy moves — the point is left untouched, so calling this for the player
 * never fights the player's own input and "moving away is always possible"
 * holds trivially. */
function separateFromPoint(map: LevelMap, enemy: Enemy, point: Vec2, minDist: number): void {
  const dx = enemy.pos.x - point.x;
  const dy = enemy.pos.y - point.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;

  let nx: number;
  let ny: number;
  if (dist < 1e-6) {
    const fb = fallbackDirection(enemy.id);
    nx = fb.x;
    ny = fb.y;
  } else {
    nx = dx / dist;
    ny = dy / dist;
  }
  const push = minDist - dist + 0.001;
  enemy.pos = moveWithCollision(map, enemy.pos, nx * push, ny * push, ENEMY_RADIUS);
}

/** Establishes a stable minimum distance between the player and every alive
 * enemy, and between alive enemies themselves, every frame — the piece
 * previously entirely missing, which is what let the player and an enemy
 * fully coincide and made contact damage tick forever at zero distance.
 * Player-enemy separation is a single pass (only the enemy yields ground).
 * Enemy-enemy separation runs SEPARATION_ITERATIONS fixed passes so three
 * enemies converging on one point spread back out over a few frames instead
 * of permanently collapsing into it — bounded, never an unbounded loop. */
export function resolveEntitySeparation(state: GameState): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    separateFromPoint(state.map, enemy, state.player.pos, PLAYER_ENEMY_MIN_DIST);
  }

  for (let iter = 0; iter < SEPARATION_ITERATIONS; iter++) {
    for (let i = 0; i < state.enemies.length; i++) {
      const a = state.enemies[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < state.enemies.length; j++) {
        const b = state.enemies[j]!;
        if (!b.alive) continue;

        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= ENEMY_ENEMY_MIN_DIST) continue;

        let nx: number;
        let ny: number;
        if (dist < 1e-6) {
          const fb = fallbackDirection(a.id ^ b.id);
          nx = fb.x;
          ny = fb.y;
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }
        const half = (ENEMY_ENEMY_MIN_DIST - dist) / 2 + 0.001;
        a.pos = moveWithCollision(state.map, a.pos, -nx * half, -ny * half, ENEMY_RADIUS);
        b.pos = moveWithCollision(state.map, b.pos, nx * half, ny * half, ENEMY_RADIUS);
      }
    }
  }
}

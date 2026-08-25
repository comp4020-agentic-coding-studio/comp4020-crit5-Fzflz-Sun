// The one rule under a focused automated test: a shot can only damage the
// nearest visible enemy on the ray, and a wall in front of an enemy makes it
// untouchable, however close it is. See spec/combat.test.ts.
import type { Enemy, GameState, LevelMap, Vec2 } from "./types";
import { castRay } from "./raycast";
import { moveWithCollision } from "./level";
import {
  DEATH_PARTICLE_COUNT,
  DEATH_PARTICLE_TTL,
  ENEMY_RADIUS,
  FIRE_COOLDOWN,
  HITSCAN_AIM_TOLERANCE,
  HITSCAN_DAMAGE,
  HITSCAN_RANGE,
  HIT_FLASH_DURATION,
  KNOCKBACK_DISTANCE,
  MUZZLE_PARTICLE_TTL,
} from "./constants";

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Finds the nearest living enemy the ray from `origin` at `angle` can reach.
 * An enemy counts as hit only if:
 *   - it's within `maxRange`,
 *   - it's within `aimTolerance` radians of the exact ray direction, and
 *   - no wall sits between the origin and the enemy (the wall distance from
 *     `castRay` is compared directly against the enemy's own distance).
 * Ties for "nearest" go to the smaller distance; a farther enemy behind a
 * nearer one is never hit even if both are unoccluded and in tolerance.
 */
export function resolveHitscan(
  map: LevelMap,
  origin: Vec2,
  angle: number,
  enemies: Enemy[],
  maxRange: number,
  aimTolerance: number,
): Enemy | null {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const wallDistance = castRay(map, origin, dirX, dirY, maxRange).distance;

  let closest: Enemy | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const dx = enemy.pos.x - origin.x;
    const dy = enemy.pos.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > maxRange) continue;
    // A wall strictly closer than the enemy blocks the shot outright.
    if (distance >= wallDistance) continue;

    const angleToEnemy = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(angle - angleToEnemy)) > aimTolerance) continue;

    if (distance < closestDistance) {
      closestDistance = distance;
      closest = enemy;
    }
  }

  return closest;
}

export function applyHitscanDamage(state: GameState, enemy: Enemy, amount: number): void {
  enemy.health -= amount;
  enemy.flashTimer = HIT_FLASH_DURATION;

  const dx = enemy.pos.x - state.player.pos.x;
  const dy = enemy.pos.y - state.player.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  enemy.pos = moveWithCollision(
    state.map,
    enemy.pos,
    (dx / dist) * KNOCKBACK_DISTANCE,
    (dy / dist) * KNOCKBACK_DISTANCE,
    ENEMY_RADIUS,
  );

  if (enemy.health <= 0 && enemy.alive) {
    enemy.alive = false;
    enemy.state = "dead";
    spawnDeathBurst(state, enemy.pos);
  }
}

function spawnDeathBurst(state: GameState, pos: Vec2): void {
  for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
    const a = (Math.PI * 2 * i) / DEATH_PARTICLE_COUNT;
    const speed = 1 + Math.random() * 1.5;
    state.particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      ttl: DEATH_PARTICLE_TTL,
      maxTtl: DEATH_PARTICLE_TTL,
      color: "#f4f1e8",
    });
  }
}

export function handlePlayerFire(state: GameState, renderAngle: number): void {
  const { player } = state;
  if (player.fireCooldown > 0 || player.ammo <= 0) return;

  player.fireCooldown = FIRE_COOLDOWN;
  player.ammo -= 1;

  const target = resolveHitscan(
    state.map,
    player.pos,
    renderAngle,
    state.enemies,
    HITSCAN_RANGE,
    HITSCAN_AIM_TOLERANCE,
  );

  if (target) applyHitscanDamage(state, target, HITSCAN_DAMAGE);

  state.particles.push({
    pos: { x: player.pos.x + Math.cos(renderAngle) * 0.4, y: player.pos.y + Math.sin(renderAngle) * 0.4 },
    vel: { x: 0, y: 0 },
    ttl: MUZZLE_PARTICLE_TTL,
    maxTtl: MUZZLE_PARTICLE_TTL,
    color: "#fff7cc",
  });
}

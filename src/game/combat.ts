// Player-side combat: hitscan resolution (against enemies and, with priority,
// against incoming projectiles), damage application, and everything a kill
// triggers — score, combo, hit-stop, particles, and deterministic resource
// drops. The single fire input does triple duty (shoot an enemy, shoot down
// a projectile, and — via the pierce/impact upgrades — sometimes both harder)
// without ever adding a new keybind or a weapon slot.
import type { Enemy, GameState, LevelMap, Projectile, Vec2 } from "./types";
import { castRay } from "./raycast";
import { moveWithCollision } from "./level";
import {
  BRUTE_HEALTH_DROP_AMOUNT,
  BRUTE_HEALTH_DROP_AMOUNT_SALVAGE,
  BRUTE_KILL_PARTICLE_MULTIPLIER,
  COLOR_CREAM,
  COLOR_CYAN,
  COLOR_FLOOR,
  COLOR_ICE,
  COLOR_LAVENDER,
  COMBO_KILLS_PER_STEP,
  COMBO_MAX_MULTIPLIER,
  DEATH_PARTICLE_COUNT,
  DEATH_PARTICLE_TTL,
  FIRE_COOLDOWN,
  HITSCAN_AIM_TOLERANCE,
  HITSCAN_DAMAGE,
  HITSCAN_RANGE,
  HITSTOP_KILL_BRUTE,
  HITSTOP_KILL_NORMAL,
  HIT_FLASH_DURATION,
  HIT_PARTICLE_COUNT,
  IMPACT_DAMAGE_MULTIPLIER,
  IMPACT_KNOCKBACK_MULTIPLIER,
  KILL_AMMO_DROP_AMOUNT,
  KILL_AMMO_DROP_AMOUNT_SALVAGE,
  KILL_AMMO_DROP_INTERVAL,
  KILL_PARTICLE_MULTIPLIER,
  KNOCKBACK_DISTANCE,
  MUZZLE_PARTICLE_TTL,
  PROJECTILE_DESTROY_AIM_TOLERANCE,
  PROJECTILE_DESTROY_RANGE,
  RAPID_COOLDOWN_MULTIPLIER,
  SCORE_BRUTE,
  SCORE_GRUNT,
  SCORE_SCOUT,
  WEAPON_FIRE_ANIM_DURATION,
} from "./constants";

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** The only place that ever lowers player health. Every damage source
 * (contact, projectile) routes through here so `hurtEventId` is a reliable
 * "the player was just hurt" signal for audio/HUD/combo-reset — decoupled
 * from comparing health across frames, which can't be throttled and can't
 * tell one real hit apart from several small ones landing the same frame. */
export function applyPlayerDamage(state: GameState, amount: number): void {
  if (amount <= 0) return;
  state.player.health = Math.max(0, state.player.health - amount);
  state.hurtEventId += 1;
}

/** All alive, unoccluded, in-tolerance enemies along a ray, nearest first,
 * capped at maxHits. The PIERCE upgrade is just this called with maxHits=2
 * instead of 1 — no separate pierce-only code path to keep in sync. */
export function resolveHitscanMulti(
  map: LevelMap,
  origin: Vec2,
  angle: number,
  enemies: Enemy[],
  maxRange: number,
  aimTolerance: number,
  maxHits: number,
): Enemy[] {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const wallDistance = castRay(map, origin, dirX, dirY, maxRange).distance;

  const candidates: Array<{ enemy: Enemy; distance: number }> = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.pos.x - origin.x;
    const dy = enemy.pos.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > maxRange || distance >= wallDistance) continue;
    const angleToEnemy = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(angle - angleToEnemy)) > aimTolerance) continue;
    candidates.push({ enemy, distance });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, maxHits).map((c) => c.enemy);
}

export function resolveHitscan(
  map: LevelMap,
  origin: Vec2,
  angle: number,
  enemies: Enemy[],
  maxRange: number,
  aimTolerance: number,
): Enemy | null {
  return resolveHitscanMulti(map, origin, angle, enemies, maxRange, aimTolerance, 1)[0] ?? null;
}

/** Nearest incoming projectile along the ray, for the "shoot down projectiles
 * with the same fire input" mechanic. Checked before any enemy hit, and
 * returning early on a hit is what guarantees no double-hit (destroy the
 * projectile OR hit whatever's behind it, never both in one shot). */
export function resolveProjectileHitscan(
  map: LevelMap,
  origin: Vec2,
  angle: number,
  projectiles: Projectile[],
  maxRange: number,
  aimTolerance: number,
): Projectile | null {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const wallDistance = castRay(map, origin, dirX, dirY, maxRange).distance;

  let closest: Projectile | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const projectile of projectiles) {
    const dx = projectile.pos.x - origin.x;
    const dy = projectile.pos.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > maxRange || distance >= wallDistance) continue;
    const angleToProjectile = Math.atan2(dy, dx);
    if (Math.abs(normalizeAngle(angle - angleToProjectile)) > aimTolerance) continue;
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = projectile;
    }
  }
  return closest;
}

function spawnDeathBurst(state: GameState, pos: Vec2, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    const speed = 1 + Math.random() * 1.5;
    state.particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      ttl: DEATH_PARTICLE_TTL,
      maxTtl: DEATH_PARTICLE_TTL,
      color: i % 2 === 0 ? COLOR_CREAM : COLOR_FLOOR,
    });
  }
}

function spawnHitSpark(state: GameState, pos: Vec2): void {
  for (let i = 0; i < HIT_PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 0.6;
    state.particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      ttl: DEATH_PARTICLE_TTL * 0.5,
      maxTtl: DEATH_PARTICLE_TTL * 0.5,
      color: COLOR_LAVENDER,
    });
  }
}

function killEnemy(state: GameState, enemy: Enemy): void {
  const baseScore = enemy.kind === "grunt" ? SCORE_GRUNT : enemy.kind === "scout" ? SCORE_SCOUT : SCORE_BRUTE;
  state.score += baseScore * state.multiplier;
  state.killCount += 1;
  state.comboKills += 1;
  state.multiplier = Math.min(COMBO_MAX_MULTIPLIER, 1 + Math.floor(state.comboKills / COMBO_KILLS_PER_STEP));
  state.bestMultiplier = Math.max(state.bestMultiplier, state.multiplier);

  const isBrute = enemy.kind === "brute";
  state.hitStopTimer = Math.max(state.hitStopTimer, isBrute ? HITSTOP_KILL_BRUTE : HITSTOP_KILL_NORMAL);

  const particleMultiplier = isBrute ? BRUTE_KILL_PARTICLE_MULTIPLIER : KILL_PARTICLE_MULTIPLIER;
  spawnDeathBurst(state, enemy.pos, Math.round(DEATH_PARTICLE_COUNT * particleMultiplier));

  if (state.killCount % KILL_AMMO_DROP_INTERVAL === 0) {
    state.nextId += 1;
    state.pickups.push({
      id: state.nextId,
      kind: "ammo",
      pos: { x: enemy.pos.x, y: enemy.pos.y },
      collected: false,
      amount: state.upgrades.salvage ? KILL_AMMO_DROP_AMOUNT_SALVAGE : KILL_AMMO_DROP_AMOUNT,
    });
  }
  if (isBrute) {
    state.nextId += 1;
    state.pickups.push({
      id: state.nextId,
      kind: "health",
      pos: { x: enemy.pos.x + 0.25, y: enemy.pos.y + 0.25 },
      collected: false,
      amount: state.upgrades.salvage ? BRUTE_HEALTH_DROP_AMOUNT_SALVAGE : BRUTE_HEALTH_DROP_AMOUNT,
    });
  }
}

export function applyHitscanDamage(state: GameState, enemy: Enemy, amount: number): void {
  const impact = state.upgrades.impact;
  const dmg = amount * (impact ? IMPACT_DAMAGE_MULTIPLIER : 1);
  enemy.health -= dmg;

  const dx = enemy.pos.x - state.player.pos.x;
  const dy = enemy.pos.y - state.player.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const knock = KNOCKBACK_DISTANCE * (impact ? IMPACT_KNOCKBACK_MULTIPLIER : 1);
  enemy.pos = moveWithCollision(state.map, enemy.pos, (dx / dist) * knock, (dy / dist) * knock, 0.3);

  if (enemy.alive && enemy.health <= 0) {
    enemy.alive = false;
    enemy.state = "dead";
    killEnemy(state, enemy);
  } else {
    // Dead enemies are skipped entirely by collectBillboards, so flashTimer
    // has no visual effect on a lethal hit — only set it here, on the
    // non-lethal branch. This also means playEventSounds' "flash just
    // started" transition never fires for an enemy that died on this same
    // hit, so a kill plays exactly one enemyDeath cue, not enemyDeath +
    // enemyHit together.
    enemy.flashTimer = HIT_FLASH_DURATION;
    spawnHitSpark(state, enemy.pos);
  }
}

function spawnProjectileDestroyBurst(state: GameState, pos: Vec2): void {
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const speed = 1.2 + Math.random();
    state.particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      ttl: 0.3,
      maxTtl: 0.3,
      color: i % 2 === 0 ? COLOR_CYAN : COLOR_ICE,
    });
  }
}

export function handlePlayerFire(state: GameState, renderAngle: number): void {
  const { player } = state;
  if (player.fireCooldown > 0 || player.ammo <= 0) return;

  player.fireCooldown = FIRE_COOLDOWN * (state.upgrades.rapid ? RAPID_COOLDOWN_MULTIPLIER : 1);
  player.ammo -= 1;
  // Independent of fireCooldown (which Rapid shortens) so both weapons'
  // animations always start from the same frame 0 — and only on an actual
  // shot that consumed ammo, never a no-op fire-held-with-no-ammo frame.
  player.fireAnimationTimer = WEAPON_FIRE_ANIM_DURATION;

  const destroyed = resolveProjectileHitscan(
    state.map,
    player.pos,
    renderAngle,
    state.projectiles,
    PROJECTILE_DESTROY_RANGE,
    PROJECTILE_DESTROY_AIM_TOLERANCE,
  );

  if (destroyed) {
    state.projectiles = state.projectiles.filter((p) => p !== destroyed);
    state.projectilesDestroyed += 1;
    spawnProjectileDestroyBurst(state, destroyed.pos);
  } else {
    const maxHits = state.upgrades.pierce ? 2 : 1;
    const targets = resolveHitscanMulti(
      state.map,
      player.pos,
      renderAngle,
      state.enemies,
      HITSCAN_RANGE,
      HITSCAN_AIM_TOLERANCE,
      maxHits,
    );
    for (const target of targets) applyHitscanDamage(state, target, HITSCAN_DAMAGE);
  }

  state.particles.push({
    pos: { x: player.pos.x + Math.cos(renderAngle) * 0.4, y: player.pos.y + Math.sin(renderAngle) * 0.4 },
    vel: { x: 0, y: 0 },
    ttl: MUZZLE_PARTICLE_TTL,
    maxTtl: MUZZLE_PARTICLE_TTL,
    color: COLOR_CREAM,
  });
}

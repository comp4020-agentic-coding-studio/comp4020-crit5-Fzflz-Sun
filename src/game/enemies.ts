// Enemy definitions and AI. Two "normal" kinds (grunt, scout) plus one
// stronger kind (brute) — the asset manifest names the same three.
import type { Enemy, EnemyKind, GameState, Vec2 } from "./types";
import { hasLineOfSight } from "./raycast";
import { moveWithCollision } from "./level";
import { ENEMY_RADIUS, ENEMY_STOP_DISTANCE, PROJECTILE_TTL } from "./constants";

interface EnemyDef {
  health: number;
  speed: number; // tiles/sec
  damage: number; // per second of contact, or per projectile hit
  sightRange: number;
  fireInterval: number;
  projectileSpeed: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: { health: 1, speed: 0.9, damage: 6, sightRange: 9, fireInterval: 2.2, projectileSpeed: 2.4 },
  scout: { health: 2, speed: 1.6, damage: 8, sightRange: 10, fireInterval: 1.6, projectileSpeed: 3.2 },
  brute: { health: 4, speed: 1.1, damage: 14, sightRange: 11, fireInterval: 1.3, projectileSpeed: 3.6 },
};

let enemyIdCounter = 0;

export function spawnEnemy(kind: EnemyKind, pos: Vec2, overrides: Partial<EnemyDef> = {}): Enemy {
  const def = { ...ENEMY_DEFS[kind], ...overrides };
  enemyIdCounter += 1;
  return {
    id: enemyIdCounter,
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
    contactRadius: ENEMY_STOP_DISTANCE,
    sightRange: def.sightRange,
    fireInterval: def.fireInterval,
    projectileSpeed: def.projectileSpeed,
  };
}

export function updateEnemies(state: GameState, dt: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.flashTimer > 0) enemy.flashTimer = Math.max(0, enemy.flashTimer - dt);

    const dx = state.player.pos.x - enemy.pos.x;
    const dy = state.player.pos.y - enemy.pos.y;
    const dist = Math.hypot(dx, dy);

    const canSeePlayer = dist <= enemy.sightRange && hasLineOfSight(state.map, enemy.pos, state.player.pos);
    if (canSeePlayer) enemy.state = "alert";
    if (enemy.state !== "alert") continue;

    if (dist > enemy.contactRadius) {
      const nx = dx / dist;
      const ny = dy / dist;
      const step = enemy.speed * dt;
      enemy.pos = moveWithCollision(state.map, enemy.pos, nx * step, ny * step, ENEMY_RADIUS);
    } else {
      state.player.health = Math.max(0, state.player.health - enemy.damage * dt);
    }

    enemy.fireCooldown -= dt;
    if (canSeePlayer && enemy.fireCooldown <= 0 && dist > enemy.contactRadius) {
      fireProjectile(state, enemy, dx / dist, dy / dist);
      enemy.fireCooldown = enemy.fireInterval;
    }
  }
}

function fireProjectile(state: GameState, enemy: Enemy, dirX: number, dirY: number): void {
  state.nextId += 1;
  state.projectiles.push({
    id: state.nextId,
    pos: { x: enemy.pos.x, y: enemy.pos.y },
    vel: { x: dirX * enemy.projectileSpeed, y: dirY * enemy.projectileSpeed },
    ttl: PROJECTILE_TTL,
    damage: enemy.damage,
  });
}

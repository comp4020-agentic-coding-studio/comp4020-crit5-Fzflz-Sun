// Assembles a fresh game and steps it forward one frame at a time. This is
// the only place that knows how all the other modules fit together — game
// rules live here and in the modules it calls, never in the renderer.
import type { GameState, InputState, Pickup } from "./types";
import { buildLevel, isSolid, moveWithCollision, updateDoors } from "./level";
import { spawnEnemy, updateEnemies } from "./enemies";
import { handlePlayerFire } from "./combat";
import { quantizeAngle } from "./angle";
import {
  DOOR_OPEN_RADIUS,
  EXIT_RADIUS,
  PICKUP_RADIUS,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  PLAYER_TURN_SPEED,
  PROJECTILE_RADIUS,
  STARTING_AMMO,
  STARTING_HEALTH,
} from "./constants";

function makePickups(): Pickup[] {
  const defs: Array<{ kind: Pickup["kind"]; pos: { x: number; y: number }; amount: number }> = [
    { kind: "health", pos: { x: 2.5, y: 4.5 }, amount: 25 },
    { kind: "ammo", pos: { x: 16.5, y: 4.5 }, amount: 12 },
    { kind: "health", pos: { x: 2.5, y: 12.5 }, amount: 25 },
    { kind: "ammo", pos: { x: 15.5, y: 12.5 }, amount: 12 },
  ];
  return defs.map((d, i) => ({ id: i + 1, kind: d.kind, pos: d.pos, collected: false, amount: d.amount }));
}

/** Builds a brand-new game: fresh level, fresh player, fresh enemies. Called
 * on first load and again on every restart, so nothing from a previous run
 * (a dead enemy, a spent pickup, an open door) ever carries over. */
export function createInitialState(): GameState {
  const map = buildLevel();

  const player = {
    pos: { x: 3, y: 3.5 },
    angle: 0,
    health: STARTING_HEALTH,
    maxHealth: STARTING_HEALTH,
    ammo: STARTING_AMMO,
    fireCooldown: 0,
  };

  const enemies = [
    // The one right ahead of the start position: slow and easy, so the very
    // first move a stranger makes is "walk up and shoot it" — no text needed.
    spawnEnemy("grunt", { x: 5.5, y: 3.5 }, { speed: 0.15, fireInterval: 4 }),
    spawnEnemy("grunt", { x: 17, y: 3 }),
    spawnEnemy("scout", { x: 18.5, y: 2 }),
    spawnEnemy("grunt", { x: 3, y: 11.5 }),
    spawnEnemy("scout", { x: 4.5, y: 12 }),
    spawnEnemy("brute", { x: 17, y: 10 }),
    spawnEnemy("grunt", { x: 19.5, y: 9.5 }),
  ];

  return {
    map,
    player,
    enemies,
    projectiles: [],
    pickups: makePickups(),
    particles: [],
    phase: "playing",
    elapsed: 0,
    nextId: 1000,
  };
}

function updateProjectiles(state: GameState, dt: number): void {
  const survivors = [];
  for (const p of state.projectiles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.ttl -= dt;

    if (p.ttl <= 0 || isSolid(state.map, p.pos.x, p.pos.y)) continue;

    const dx = state.player.pos.x - p.pos.x;
    const dy = state.player.pos.y - p.pos.y;
    if (Math.hypot(dx, dy) <= PROJECTILE_RADIUS + PLAYER_RADIUS) {
      state.player.health = Math.max(0, state.player.health - p.damage);
      continue;
    }

    survivors.push(p);
  }
  state.projectiles = survivors;
}

function updateParticles(state: GameState, dt: number): void {
  const survivors = [];
  for (const particle of state.particles) {
    particle.pos.x += particle.vel.x * dt;
    particle.pos.y += particle.vel.y * dt;
    particle.ttl -= dt;
    if (particle.ttl > 0) survivors.push(particle);
  }
  state.particles = survivors;
}

function updatePlayerMotion(state: GameState, input: InputState, dt: number): void {
  const { player } = state;

  const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  player.angle += turn * PLAYER_TURN_SPEED * dt;

  const move = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  if (move !== 0) {
    const dx = Math.cos(player.angle) * move * PLAYER_MOVE_SPEED * dt;
    const dy = Math.sin(player.angle) * move * PLAYER_MOVE_SPEED * dt;
    player.pos = moveWithCollision(state.map, player.pos, dx, dy, PLAYER_RADIUS);
  }

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
}

function updatePickups(state: GameState): void {
  for (const pickup of state.pickups) {
    if (pickup.collected) continue;
    const dx = state.player.pos.x - pickup.pos.x;
    const dy = state.player.pos.y - pickup.pos.y;
    if (Math.hypot(dx, dy) > PICKUP_RADIUS) continue;

    pickup.collected = true;
    if (pickup.kind === "ammo") state.player.ammo += pickup.amount;
    else state.player.health = Math.min(state.player.maxHealth, state.player.health + pickup.amount);
  }
}

function checkEndConditions(state: GameState): void {
  if (state.player.health <= 0) {
    state.phase = "lost";
    return;
  }

  const allDead = state.enemies.every((e) => !e.alive);
  if (!allDead) return;

  const exitCenter = { x: state.map.exit.x + 0.5, y: state.map.exit.y + 0.5 };
  const dx = state.player.pos.x - exitCenter.x;
  const dy = state.player.pos.y - exitCenter.y;
  if (Math.hypot(dx, dy) <= EXIT_RADIUS) state.phase = "won";
}

/** Advances the simulation by one frame. Returns the state to keep using —
 * a fresh one on restart, the same (mutated) one otherwise. */
export function update(state: GameState, input: InputState, dt: number): GameState {
  if (state.phase !== "playing") {
    return input.restart ? createInitialState() : state;
  }

  state.elapsed += dt;
  updatePlayerMotion(state, input, dt);
  updateDoors(state.map, state.player.pos, DOOR_OPEN_RADIUS);

  const renderAngle = quantizeAngle(state.player.angle);
  if (input.fire) handlePlayerFire(state, renderAngle);

  updateEnemies(state, dt);
  updateProjectiles(state, dt);
  updateParticles(state, dt);
  updatePickups(state);
  checkEndConditions(state);

  return state;
}

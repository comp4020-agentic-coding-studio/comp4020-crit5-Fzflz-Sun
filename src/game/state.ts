// Assembles a fresh game and steps it forward one frame at a time. This is
// the only place that knows how all the other modules fit together — game
// rules live here and in the modules it calls, never in the renderer.
import type { GameState, InputState, Pickup } from "./types";
import { buildLevel, isSolid, moveWithCollision, updateDoors } from "./level";
import { resolveEntitySeparation, spawnEnemy, updateEnemies } from "./enemies";
import { applyPlayerDamage, handlePlayerFire } from "./combat";
import { updateEncounter, updatePedestals } from "./encounters";
import { quantizeAngle } from "./angle";
import {
  BRUTE_TELEGRAPH_DURATION,
  DOOR_OPEN_RADIUS,
  EXIT_RADIUS,
  MAX_ACTIVE_PARTICLES,
  PICKUP_RADIUS,
  PLAYER_MOVE_SPEED,
  PLAYER_MOVE_SPEED_BACK,
  PLAYER_RADIUS,
  PLAYER_TURN_SPEED,
  PROJECTILE_RADIUS,
  STARTING_AMMO,
  STARTING_HEALTH,
} from "./constants";

/** Just three fixed pickups left on the map, all tucked into the two
 * non-combat rooms (the start room and Room D's dead-end detour) — sustain
 * during actual fights now comes from kill drops (see combat.ts), so a fixed
 * map pickup is a small bonus for exploring rather than the main supply. */
function makePickups(): Pickup[] {
  const defs: Array<{ kind: Pickup["kind"]; pos: { x: number; y: number }; amount: number }> = [
    { kind: "ammo", pos: { x: 5, y: 5 }, amount: 6 },
    { kind: "health", pos: { x: 3, y: 13.5 }, amount: 25 },
    { kind: "ammo", pos: { x: 4, y: 16 }, amount: 10 },
  ];
  return defs.map((d, i) => ({ id: i + 1, kind: d.kind, pos: d.pos, collected: false, amount: d.amount }));
}

/** Builds a brand-new game: fresh level, fresh player, one tutorial enemy,
 * and a freshly-reset encounter/score/upgrade state. Called on first load
 * and again on every restart, so nothing from a previous run ever carries
 * over. */
export function createInitialState(): GameState {
  const map = buildLevel();

  const player = {
    pos: { x: 3, y: 3.5 },
    angle: 0,
    health: STARTING_HEALTH,
    maxHealth: STARTING_HEALTH,
    ammo: STARTING_AMMO,
    fireCooldown: 0,
    fireAnimationTimer: 0,
  };

  const enemies = [
    // The one right ahead of the start position: barely moving and with no
    // ranged attack at all (grunts never have one), so the very first move a
    // stranger makes is "walk up and shoot it" — no text needed.
    spawnEnemy("grunt", { x: 6.5, y: 3.5 }, { speed: 0.05 }),
  ];

  return {
    map,
    player,
    enemies,
    projectiles: [],
    pickups: makePickups(),
    particles: [],
    pedestals: [],
    phase: "playing",
    elapsed: 0,
    nextId: 1000,

    encounter: {
      stage: "tutorial",
      waveIndex: 0,
      waveQueue: [],
      pending: [],
      pauseTimer: 0,
    },

    score: 0,
    multiplier: 1,
    bestMultiplier: 1,
    comboKills: 0,
    killCount: 0,
    damageTaken: 0,

    hitStopTimer: 0,

    hurtEventId: 0,

    hintShown: false,
    hintTimer: 0,
    projectilesDestroyed: 0,

    upgrades: { rapid: false, impact: false, pierce: false, salvage: false },
    upgradeChoice1: null,
    upgradeChoice2: null,
  };
}

function updateProjectiles(state: GameState, dt: number): void {
  if (state.projectiles.length === 0) return;
  const survivors = [];
  for (const p of state.projectiles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.ttl -= dt;

    if (p.ttl <= 0 || isSolid(state.map, p.pos.x, p.pos.y)) continue;

    const dx = state.player.pos.x - p.pos.x;
    const dy = state.player.pos.y - p.pos.y;
    if (Math.hypot(dx, dy) <= PROJECTILE_RADIUS + PLAYER_RADIUS) {
      applyPlayerDamage(state, p.damage);
      continue;
    }

    survivors.push(p);
  }
  state.projectiles = survivors;
}

function updateParticles(state: GameState, dt: number): void {
  if (state.particles.length === 0) return;
  const survivors = [];
  for (const particle of state.particles) {
    particle.pos.x += particle.vel.x * dt;
    particle.pos.y += particle.vel.y * dt;
    particle.ttl -= dt;
    if (particle.ttl > 0) survivors.push(particle);
  }
  // Global cap: a burst of near-simultaneous deaths (several Brutes at once)
  // must not grow this array without bound. Keep the newest, since those are
  // whatever just happened and are what the player's eye is on.
  state.particles =
    survivors.length > MAX_ACTIVE_PARTICLES ? survivors.slice(survivors.length - MAX_ACTIVE_PARTICLES) : survivors;
}

function updatePlayerMotion(state: GameState, input: InputState, dt: number): void {
  const { player } = state;

  const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  player.angle += turn * PLAYER_TURN_SPEED * dt;

  const move = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  if (move !== 0) {
    const speed = move > 0 ? PLAYER_MOVE_SPEED : PLAYER_MOVE_SPEED_BACK;
    const dx = Math.cos(player.angle) * move * speed * dt;
    const dy = Math.sin(player.angle) * move * speed * dt;
    player.pos = moveWithCollision(state.map, player.pos, dx, dy, PLAYER_RADIUS);
  }

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  // Decrements every frame regardless of hit-stop — the player's own weapon
  // animation must never visibly pause while a kill's world-freeze is active.
  player.fireAnimationTimer = Math.max(0, player.fireAnimationTimer - dt);
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

  if (state.encounter.stage !== "done") return;

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

  const healthBefore = state.player.health;
  const hurtEventBefore = state.hurtEventId;

  // A kill briefly freezes only the enemy/world side of the sim for a punchy
  // "hit-stop" beat — enemy movement/AI, enemy projectiles, and world
  // particles pause for a frame or two. Everything the player directly feels
  // (input, movement/turning, fire cooldown, the weapon-fire animation,
  // elapsed time, HUD/audio, restart) keeps running every frame below, so
  // holding a key through a kill never reads as a stutter.
  state.elapsed += dt;
  updatePlayerMotion(state, input, dt);
  updateDoors(state.map, state.player.pos, DOOR_OPEN_RADIUS);

  const renderAngle = quantizeAngle(state.player.angle);
  if (input.fire) handlePlayerFire(state, renderAngle);

  if (state.hitStopTimer > 0) {
    state.hitStopTimer = Math.max(0, state.hitStopTimer - dt);
  } else {
    updateEnemies(state, dt, BRUTE_TELEGRAPH_DURATION);
    resolveEntitySeparation(state);
    updateProjectiles(state, dt);
    updateParticles(state, dt);
  }
  updatePickups(state);
  updateEncounter(state, dt);
  updatePedestals(state);

  if (state.hintTimer > 0) state.hintTimer = Math.max(0, state.hintTimer - dt);

  // Driven by the explicit damage-event counter, not by comparing health
  // across frames — a snapshot diff can't be throttled independently and
  // conflates "took real damage" with any other reason health might move.
  if (state.hurtEventId !== hurtEventBefore) {
    state.damageTaken += healthBefore - state.player.health;
    state.comboKills = 0;
    state.multiplier = 1;
  }

  checkEndConditions(state);

  return state;
}

// Assembles a fresh game and steps it forward one frame at a time. This is
// the only place that knows how all the other modules fit together — game
// rules live here and in the modules it calls, never in the renderer.
// state.screen gates everything below: world sim, director spawning, and the
// survival clock only ever advance while screen is "playing" or "countdown"
// (countdown itself holds spawning off, see updateCountdown); every other
// screen freezes the world outright and just renders its last frame under a
// DOM menu overlay (see main.ts).
import type { GameState, InputState, Pickup, PlayerStats, ResultsSnapshot } from "./types";
import { buildLevel, isSolid, moveWithCollision, updateDoors } from "./level";
import { resolveEntitySeparation, updateEnemies } from "./enemies";
import { applyPlayerDamage, handlePlayerFire } from "./combat";
import { beginWave, cleanupDeadEnemies, createDirectorState, createWaveState, openUpgradeMenu, updateWave } from "./director";
import { createUpgradeLevels, mobilityBackSpeed, mobilityForwardSpeed } from "./upgrades";
import { createRng } from "./rng";
import { resetInputState } from "./input";
import { quantizeAngle } from "./angle";
import {
  BRUTE_TELEGRAPH_DURATION,
  DOOR_OPEN_RADIUS,
  MAX_ACTIVE_PARTICLES,
  MAX_GROUND_PICKUPS,
  MILESTONE_TIME_SECONDS,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  PLAYER_TURN_SPEED,
  PROJECTILE_RADIUS,
  STARTING_AMMO,
  STARTING_HEALTH,
  WAVE_COUNTDOWN_DURATION,
} from "./constants";

const DEAD_SCREEN_HOLD = 1.2;
const MILESTONE_BANNER_DURATION = 5;

function createStats(): PlayerStats {
  return { totalKills: 0, gruntKills: 0, scoutKills: 0, bruteKills: 0 };
}

/** A handful of fixed, never-despawning map pickups (ttl:-1) tucked into
 * side rooms — a small bonus for exploring, not the main sustain, which now
 * comes from kill drops (see combat.ts). */
function makePickups(): Pickup[] {
  const defs: Array<{ kind: Pickup["kind"]; pos: { x: number; y: number }; amount: number }> = [
    { kind: "ammo", pos: { x: 5.5, y: 2.5 }, amount: 6 },
    { kind: "health", pos: { x: 3.5, y: 25.5 }, amount: 25 },
    { kind: "ammo", pos: { x: 39.5, y: 25.5 }, amount: 10 },
    { kind: "health", pos: { x: 20.5, y: 1.5 }, amount: 15 },
  ];
  return defs.map((d, i) => ({ id: i + 1, kind: d.kind, pos: d.pos, collected: false, amount: d.amount, ttl: -1 }));
}

/** A fixed seed keeps a fresh run's spawn/upgrade sequence reproducible for
 * tests; loadFromSlot (save.ts) overrides this with the saved rng state. */
const DEFAULT_SEED = 20260101;

/** Builds a brand-new run: fresh level, fresh player, no enemies yet (the
 * Director spawns wave 1's first enemy itself), fresh score/upgrades/stats.
 * Screen starts at "playing" — callers that want the title/menu flow first
 * should use createTitleState() instead. */
export function createInitialState(seed: number = DEFAULT_SEED): GameState {
  const map = buildLevel();

  const player = {
    pos: { x: 17, y: 15.5 },
    angle: 0,
    health: STARTING_HEALTH,
    maxHealth: STARTING_HEALTH,
    ammo: STARTING_AMMO,
    fireCooldown: 0,
    fireAnimationTimer: 0,
  };

  return {
    screen: "playing",

    map,
    player,
    enemies: [],
    projectiles: [],
    pickups: makePickups(),
    particles: [],
    telegraphs: [],

    elapsed: 0,
    nextId: 1000,
    screenTimer: 0,

    wave: createWaveState(),
    director: createDirectorState(),
    rng: createRng(seed),

    score: 0,
    multiplier: 1,
    bestMultiplier: 1,
    comboKills: 0,
    damageTaken: 0,
    stats: createStats(),

    hitStopTimer: 0,
    hurtEventId: 0,

    hintShown: false,
    hintTimer: 0,
    projectilesDestroyed: 0,

    upgrades: createUpgradeLevels(),
    upgradeOptions: [],

    milestoneReached: false,
    milestoneBannerTimer: 0,

    pendingConfirm: null,
    menuReturnScreen: null,
    saveNotice: null,
    activeSlot: null,
    results: null,
  };
}

/** The state the app boots into: the title screen, world already built (so a
 * "New Game"/"Continue" is instant) but not yet running. */
export function createTitleState(): GameState {
  const state = createInitialState();
  state.screen = "title";
  return state;
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
    const speed = move > 0 ? mobilityForwardSpeed(state.upgrades.mobility) : mobilityBackSpeed(state.upgrades.mobility);
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

/** Keeps state.pickups bounded over an infinite run (Section 5/11): drops a
 * collected pickup immediately, despawns an ordinary (ttl>=0) drop once its
 * TTL elapses, and — only if still over MAX_GROUND_PICKUPS after that — trims
 * the oldest surplus while always sparing the single newest entry, so a
 * cap-driven trim can never delete the player's only just-earned supply. */
function cleanupPickups(state: GameState, dt: number): void {
  if (state.pickups.length === 0) return;
  let survivors = [];
  for (const p of state.pickups) {
    if (p.collected) continue;
    const hasTtl = p.ttl >= 0;
    if (hasTtl) p.ttl -= dt;
    if (hasTtl && p.ttl <= 0) continue;
    survivors.push(p);
  }
  if (survivors.length > MAX_GROUND_PICKUPS) {
    const newest = survivors[survivors.length - 1]!;
    const overflow = survivors.length - MAX_GROUND_PICKUPS;
    survivors = survivors.slice(overflow);
    if (!survivors.includes(newest)) survivors.push(newest);
  }
  state.pickups = survivors;
}

function checkMilestone(state: GameState): void {
  if (state.milestoneReached) return;
  if (state.elapsed < MILESTONE_TIME_SECONDS) return;
  state.milestoneReached = true;
  state.milestoneBannerTimer = MILESTONE_BANNER_DURATION;
}

function buildResults(state: GameState): ResultsSnapshot {
  const grade = computeGrade(state);
  return {
    survivalTime: state.elapsed,
    wave: state.wave.number,
    totalKills: state.stats.totalKills,
    gruntKills: state.stats.gruntKills,
    scoutKills: state.stats.scoutKills,
    bruteKills: state.stats.bruteKills,
    score: state.score,
    bestMultiplier: state.bestMultiplier,
    upgrades: { ...state.upgrades },
    milestoneReached: state.milestoneReached,
    grade,
  };
}

/** Infinite-mode grading has no fixed "clean run" completion time to compare
 * against, so it grades survival depth (wave reached) and combat quality
 * (score-per-wave, damage taken) instead of elapsed time. */
function computeGrade(state: GameState): string {
  const perWave = state.score / Math.max(1, state.wave.number);
  const clean = state.damageTaken < STARTING_HEALTH * 0.75;
  if (state.wave.number >= 8 && perWave >= 900 && clean) return "S";
  if (state.wave.number >= 6 && perWave >= 600) return "A";
  if (state.wave.number >= 4) return "B";
  return "C";
}

/** Runs one frame of the actual world sim — everything that only advances
 * while screen is "playing". Countdown reuses this minus wave/spawn logic. */
function updateWorld(state: GameState, input: InputState, dt: number): void {
  const healthBefore = state.player.health;
  const hurtEventBefore = state.hurtEventId;

  state.elapsed += dt;
  updatePlayerMotion(state, input, dt);
  updateDoors(state.map, state.player.pos, DOOR_OPEN_RADIUS);

  const renderAngle = quantizeAngle(state.player.angle);
  if (input.fire) handlePlayerFire(state, renderAngle);

  // A kill briefly freezes only the enemy/world side of the sim for a punchy
  // "hit-stop" beat. Everything the player directly feels (input, movement,
  // fire cooldown, the weapon-fire animation, elapsed time) keeps running.
  if (state.hitStopTimer > 0) {
    state.hitStopTimer = Math.max(0, state.hitStopTimer - dt);
  } else {
    updateEnemies(state, dt, BRUTE_TELEGRAPH_DURATION);
    resolveEntitySeparation(state);
    updateProjectiles(state, dt);
    updateParticles(state, dt);
  }
  cleanupDeadEnemies(state, dt);
  updatePickups(state);
  cleanupPickups(state, dt);

  if (state.hintTimer > 0) state.hintTimer = Math.max(0, state.hintTimer - dt);
  if (state.milestoneBannerTimer > 0) state.milestoneBannerTimer = Math.max(0, state.milestoneBannerTimer - dt);

  // Driven by the explicit damage-event counter, not by comparing health
  // across frames — a snapshot diff can't be throttled independently and
  // conflates "took real damage" with any other reason health might move.
  void healthBefore;
  if (state.hurtEventId !== hurtEventBefore) {
    state.comboKills = 0;
    state.multiplier = 1;
  }

  checkMilestone(state);
}

/** Advances the simulation by one frame. Never replaces `state` wholesale —
 * screen transitions (new game, restart, load) go through menu.ts/save.ts,
 * which hand back a fresh object; update() only ever mutates in place. */
export function update(state: GameState, input: InputState, dt: number): GameState {
  switch (state.screen) {
    case "playing": {
      updateWorld(state, input, dt);
      if (state.player.health <= 0) {
        state.screen = "dead";
        state.screenTimer = DEAD_SCREEN_HOLD;
        // Leaving "playing" involuntarily (not via menu.ts) — a key held at
        // the moment of death would otherwise never see its keyup, since
        // input.ts's own listeners stop reacting once isGameActive() is false.
        resetInputState(input);
        break;
      }
      const waveFinished = updateWave(state, dt);
      if (waveFinished) {
        openUpgradeMenu(state);
        state.screen = "upgrade";
        resetInputState(input);
      }
      break;
    }
    case "countdown": {
      state.screenTimer -= dt;
      if (state.screenTimer <= 0) {
        beginWave(state, state.wave.number + 1);
        state.screen = "playing";
      }
      break;
    }
    case "dead": {
      state.screenTimer -= dt;
      if (state.screenTimer <= 0) {
        state.results = buildResults(state);
        state.screen = "results";
      }
      break;
    }
    default:
      // title / howToPlay / paused / saveMenu / loadMenu / confirm / upgrade /
      // results: the world is fully frozen, nothing to simulate.
      break;
  }
  return state;
}

/** Called once an upgrade choice has been applied (see upgrades.ts's
 * applyUpgradeChoice) — starts the pre-next-wave countdown. */
export function enterCountdown(state: GameState): void {
  state.screen = "countdown";
  state.screenTimer = WAVE_COUNTDOWN_DURATION;
}

/** "End Run" from the pause menu: skip straight to results without waiting
 * for the death sequence — the player chose to stop, not to die. */
export function endRunNow(state: GameState): void {
  state.results = buildResults(state);
  state.screen = "results";
}

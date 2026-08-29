// The Spawn Director / wave-phase state machine (Section 2/3/4 of the crit-5
// infinite-survival spec): combat -> cleanup -> upgrade advances on a fixed
// timer even with zero kills, the active-enemy count never exceeds the
// wave's cap, and dead enemies are eventually removed from state.enemies
// instead of accumulating forever over an infinite run.
import { describe, expect, it } from "vitest";
import { createInitialState, update } from "../src/game/state";
import { createInputState } from "../src/game/input";
import { beginWave, cleanupDeadEnemies } from "../src/game/director";
import type { Enemy } from "../src/game/types";
import { MAX_ACTIVE_ENEMIES_HARD_CEILING, WAVE_ACTIVE_CAP_TABLE, WAVE_RANGED_CAP } from "../src/game/constants";

function makeEnemy(id: number, overrides: Partial<Enemy> = {}): Enemy {
  return {
    id,
    kind: "grunt",
    pos: { x: 6, y: 3.5 },
    health: 1,
    maxHealth: 1,
    alive: true,
    state: "alert",
    flashTimer: 0,
    fireCooldown: 0,
    speed: 0,
    damage: 0,
    contactRadius: 0.3,
    sightRange: 10,
    fireInterval: 1,
    projectileSpeed: 1,
    projectileDamage: 1,
    telegraphTimer: 0,
    contactCooldown: 0,
    ...overrides,
  };
}

describe("wave phase progression", () => {
  it("advances combat -> cleanup -> the upgrade screen on its own timer, even with zero kills", () => {
    const state = createInitialState();
    const input = createInputState();

    let iterations = 0;
    while (state.screen === "playing" && iterations < 2000) {
      update(state, input, 0.1);
      iterations += 1;
    }

    expect(state.screen).toBe("upgrade");
    expect(state.upgradeOptions).toHaveLength(3);
  });
});

describe("active-enemy cap", () => {
  it("never lets the alive-enemy count exceed the current wave's active cap during combat", () => {
    const state = createInitialState();
    const input = createInputState();

    for (let i = 0; i < 500 && state.screen === "playing" && state.wave.phase === "combat"; i++) {
      update(state, input, 0.1);
      const alive = state.enemies.filter((e) => e.alive).length;
      expect(alive).toBeLessThanOrEqual(state.wave.activeCap);
      const ranged = state.enemies.filter((e) => e.alive && (e.kind === "scout" || e.kind === "brute")).length;
      expect(ranged).toBeLessThanOrEqual(state.wave.rangedCap);
    }
  });

  it("caps grow only up to the difficulty table's length, then stop (bounded cyclic growth, never unbounded)", () => {
    const state = createInitialState();
    beginWave(state, WAVE_ACTIVE_CAP_TABLE.length);
    const capAtTableEnd = state.wave.activeCap;

    beginWave(state, WAVE_ACTIVE_CAP_TABLE.length + 5);
    const capPastTableEnd = state.wave.activeCap;

    expect(capPastTableEnd).toBe(capAtTableEnd);
    expect(capPastTableEnd).toBeLessThanOrEqual(MAX_ACTIVE_ENEMIES_HARD_CEILING);
    expect(state.wave.rangedCap).toBe(WAVE_RANGED_CAP);
  });
});

describe("dead-enemy cleanup", () => {
  it("removes an enemy from state.enemies once its post-death grace timer elapses", () => {
    const state = createInitialState();
    state.enemies = [
      makeEnemy(1, { alive: false, state: "dead", deathTimer: 0.05 }),
      makeEnemy(2, { alive: true }),
    ];

    cleanupDeadEnemies(state, 0.1);

    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]!.id).toBe(2);
  });

  it("keeps a dead enemy around while its grace timer has not yet elapsed", () => {
    const state = createInitialState();
    state.enemies = [makeEnemy(1, { alive: false, state: "dead", deathTimer: 1 })];

    cleanupDeadEnemies(state, 0.1);

    expect(state.enemies).toHaveLength(1);
  });

  it("never grows state.enemies without bound over a long run with continuous deaths", () => {
    const state = createInitialState();
    for (let tick = 0; tick < 500; tick++) {
      state.enemies.push(makeEnemy(10_000 + tick, { alive: false, state: "dead", deathTimer: 0.6 }));
      cleanupDeadEnemies(state, 0.1);
      expect(state.enemies.length).toBeLessThan(20);
    }
  });
});

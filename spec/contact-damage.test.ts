// Contact-damage discreteness and separation regression tests (crit-5 perf
// fixes #1/#2). Sustained player-enemy overlap used to tick full-damage every
// single frame (~120 audio/damage events/sec) because nothing capped contact
// to a discrete rate, and an exactly-coincident pair produced a (0,0)
// separation vector that never pushed them apart. These tests simulate real
// sustained contact — not a single frame — and check the event rate, the
// preserved DPS, the previously-unreachable Scout branch, and that
// separation always resolves to a deterministic, non-(0,0), in-bounds push.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { resolveEntitySeparation, spawnEnemy, updateEnemies } from "../src/game/enemies";
import { CONTACT_DAMAGE_INTERVAL, ENEMY_ENEMY_MIN_DIST, PLAYER_ENEMY_MIN_DIST } from "../src/game/constants";

const TELEGRAPH_DONE = 0.6; // brute telegraph window; irrelevant to grunt/scout contact

describe("contact damage: discrete, cooldown-gated events", () => {
  it("fires roughly one damage event per CONTACT_DAMAGE_INTERVAL while overlap is sustained, not one per frame", () => {
    const state = createInitialState();
    state.enemies = [spawnEnemy("grunt", { x: state.player.pos.x, y: state.player.pos.y })];
    state.enemies[0]!.state = "alert";

    const dt = 1 / 60;
    const durationSeconds = 3;
    const steps = Math.round(durationSeconds / dt);

    let hurtEvents = 0;
    let prevHurtEventId = state.hurtEventId;
    for (let i = 0; i < steps; i++) {
      updateEnemies(state, dt, TELEGRAPH_DONE);
      if (state.hurtEventId !== prevHurtEventId) {
        hurtEvents += 1;
        prevHurtEventId = state.hurtEventId;
      }
    }

    const expected = Math.round(durationSeconds / CONTACT_DAMAGE_INTERVAL);
    expect(hurtEvents).toBeGreaterThan(0);
    expect(hurtEvents).toBeGreaterThanOrEqual(expected - 2);
    expect(hurtEvents).toBeLessThanOrEqual(expected + 2);
    // The old bug produced roughly one event per frame — well over half the steps.
    expect(hurtEvents).toBeLessThan(steps / 4);
  });

  it("preserves average damage-per-second despite the coarser tick granularity", () => {
    const state = createInitialState();
    state.enemies = [spawnEnemy("grunt", { x: state.player.pos.x, y: state.player.pos.y })];
    state.enemies[0]!.state = "alert";
    state.player.maxHealth = 100000;
    state.player.health = 100000;

    const dt = 1 / 60;
    const durationSeconds = 5;
    const steps = Math.round(durationSeconds / dt);
    const healthBefore = state.player.health;

    for (let i = 0; i < steps; i++) updateEnemies(state, dt, TELEGRAPH_DONE);

    const totalDamage = healthBefore - state.player.health;
    const expectedDamage = state.enemies[0]!.damage * durationSeconds;
    expect(totalDamage).toBeGreaterThan(expectedDamage * 0.85);
    expect(totalDamage).toBeLessThan(expectedDamage * 1.15);
  });

  it("Scout's contact-damage branch actually fires when pinned inside its own contact radius (previously unreachable)", () => {
    const state = createInitialState();
    state.enemies = [spawnEnemy("scout", { x: state.player.pos.x, y: state.player.pos.y })];
    state.enemies[0]!.state = "alert";
    const healthBefore = state.player.health;

    const dt = 1 / 60;
    for (let i = 0; i < Math.round(1 / dt); i++) updateEnemies(state, dt, TELEGRAPH_DONE);

    expect(state.player.health).toBeLessThan(healthBefore);
  });
});

describe("player-enemy separation: numeric safety and deterministic fallback", () => {
  it("never produces a non-finite position when an enemy is exactly coincident with the player", () => {
    const state = createInitialState();
    state.enemies = [spawnEnemy("grunt", { x: state.player.pos.x, y: state.player.pos.y })];

    for (let i = 0; i < 5; i++) resolveEntitySeparation(state);

    const enemy = state.enemies[0]!;
    expect(Number.isFinite(enemy.pos.x)).toBe(true);
    expect(Number.isFinite(enemy.pos.y)).toBe(true);
  });

  it("pushes an exactly-coincident enemy out to at least PLAYER_ENEMY_MIN_DIST using a non-(0,0) direction", () => {
    const state = createInitialState();
    state.enemies = [spawnEnemy("grunt", { x: state.player.pos.x, y: state.player.pos.y })];

    for (let i = 0; i < 5; i++) resolveEntitySeparation(state);

    const enemy = state.enemies[0]!;
    const dist = Math.hypot(enemy.pos.x - state.player.pos.x, enemy.pos.y - state.player.pos.y);
    expect(dist).toBeGreaterThanOrEqual(PLAYER_ENEMY_MIN_DIST - 1e-6);
    expect(dist).toBeGreaterThan(0);
  });

  it("is deterministic: two identical coincident setups (same id) separate to the exact same position", () => {
    const run = () => {
      const state = createInitialState();
      const enemy = spawnEnemy("grunt", { x: state.player.pos.x, y: state.player.pos.y });
      enemy.id = 42;
      state.enemies = [enemy];
      resolveEntitySeparation(state);
      return { ...state.enemies[0]!.pos };
    };
    expect(run()).toEqual(run());
  });

  it("separates two exactly-coincident enemies to at least ENEMY_ENEMY_MIN_DIST apart", () => {
    const state = createInitialState();
    const a = spawnEnemy("grunt", { x: 5, y: 5 });
    a.id = 1;
    const b = spawnEnemy("grunt", { x: 5, y: 5 });
    b.id = 2;
    state.enemies = [a, b];

    resolveEntitySeparation(state);

    const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    expect(dist).toBeGreaterThanOrEqual(ENEMY_ENEMY_MIN_DIST - 1e-6);
    expect(Number.isFinite(a.pos.x)).toBe(true);
    expect(Number.isFinite(b.pos.x)).toBe(true);
  });
});

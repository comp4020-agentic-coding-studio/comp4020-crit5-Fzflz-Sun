// Score/combo/resource-drop rules (Section 3/5/7 of the crit-5 spec) and the
// two whole-run guarantees around them: taking damage resets the streak, and
// a restart really does wipe every run-scoped field back to zero.
import { describe, expect, it } from "vitest";
import { createInitialState, update } from "../src/game/state";
import { createInputState } from "../src/game/input";
import { applyHitscanDamage } from "../src/game/combat";
import type { Enemy } from "../src/game/types";
import {
  BRUTE_HEALTH_DROP_AMOUNT,
  KILL_AMMO_DROP_AMOUNT,
  KILL_AMMO_DROP_INTERVAL,
  SCORE_GRUNT,
} from "../src/game/constants";

function grunt(id: number, overrides: Partial<Enemy> = {}): Enemy {
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

describe("score and combo multiplier", () => {
  it("scores each kill at the base value times the multiplier in effect at that kill", () => {
    const state = createInitialState();
    for (let i = 0; i < 3; i++) applyHitscanDamage(state, grunt(i), 1);

    // Kills 1-2 land at x1 (comboKills hasn't crossed the step yet); kill 3
    // pushes comboKills to 3, which is scored at the multiplier *before* that
    // kill's own bump — so all three still land at x1: 100+100+100 = 300.
    expect(state.score).toBe(SCORE_GRUNT * 3);
    // ...and the bump lands right after, ready for the next kill.
    expect(state.multiplier).toBe(2);
    expect(state.bestMultiplier).toBe(2);
  });

  it("resets the streak to x1 only when the player takes damage", () => {
    const state = createInitialState();
    state.comboKills = 5;
    state.multiplier = 3;
    state.bestMultiplier = 3;
    // A projectile already overlapping the player deals damage on this very
    // frame's updateProjectiles pass.
    state.projectiles = [{ id: 1, pos: { ...state.player.pos }, vel: { x: 0, y: 0 }, ttl: 1, damage: 10 }];

    const input = createInputState();
    const next = update(state, input, 1 / 60);

    expect(next.player.health).toBeLessThan(100);
    expect(next.comboKills).toBe(0);
    expect(next.multiplier).toBe(1);
    // bestMultiplier is a high-water mark and must survive the reset.
    expect(next.bestMultiplier).toBe(3);
  });
});

describe("kill-triggered resource drops", () => {
  it("drops ammo on exactly every Nth kill, never in between", () => {
    const state = createInitialState();
    for (let i = 0; i < KILL_AMMO_DROP_INTERVAL - 1; i++) applyHitscanDamage(state, grunt(i), 1);
    expect(state.pickups.some((p) => p.kind === "ammo" && p.id >= 1000)).toBe(false);

    applyHitscanDamage(state, grunt(KILL_AMMO_DROP_INTERVAL - 1), 1);
    const drop = state.pickups.find((p) => p.kind === "ammo" && p.id >= 1000);
    expect(drop?.amount).toBe(KILL_AMMO_DROP_AMOUNT);
  });

  it("always drops health from a Brute kill, regardless of the kill-count interval", () => {
    const state = createInitialState();
    const brute = grunt(999, { kind: "brute", health: 1 });
    applyHitscanDamage(state, brute, 1);
    const drop = state.pickups.find((p) => p.kind === "health" && p.id >= 1000);
    expect(drop?.amount).toBe(BRUTE_HEALTH_DROP_AMOUNT);
  });
});

describe("restart", () => {
  it("wipes score, upgrades, and combo state back to a fresh run", () => {
    const state = createInitialState();
    state.phase = "lost";
    state.score = 5000;
    state.multiplier = 4;
    state.bestMultiplier = 4;
    state.killCount = 12;
    state.upgrades = { rapid: true, impact: true, pierce: true, salvage: true };
    state.upgradeChoice1 = "rapid";
    state.upgradeChoice2 = "pierce";

    const input = createInputState();
    input.restart = true;
    const fresh = update(state, input, 1 / 60);

    expect(fresh.phase).toBe("playing");
    expect(fresh.score).toBe(0);
    expect(fresh.multiplier).toBe(1);
    expect(fresh.killCount).toBe(0);
    expect(fresh.upgrades).toEqual({ rapid: false, impact: false, pierce: false, salvage: false });
    expect(fresh.upgradeChoice1).toBeNull();
    expect(fresh.upgradeChoice2).toBeNull();
  });
});

describe("results-screen transition", () => {
  it("only reaches 'won' once the final room is done and the player is at the exit", () => {
    const state = createInitialState();
    state.encounter.stage = "roomC";
    state.player.pos = { x: state.map.exit.x + 0.5, y: state.map.exit.y + 0.5 };

    const input = createInputState();
    const stillPlaying = update(state, input, 1 / 60);
    expect(stillPlaying.phase).toBe("playing");

    stillPlaying.encounter.stage = "done";
    const finished = update(stillPlaying, input, 1 / 60);
    expect(finished.phase).toBe("won");
  });
});

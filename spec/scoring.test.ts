// Score/combo/resource-drop rules (Section 3/5/7 of the crit-5 spec) and the
// two whole-run guarantees around them: taking damage resets the streak, and
// the 5-minute milestone marks a run without ending it (Section 7 — infinite
// survival has no fixed "won" state to reach).
import { describe, expect, it } from "vitest";
import { createInitialState, endRunNow, update } from "../src/game/state";
import { createInputState } from "../src/game/input";
import { applyHitscanDamage } from "../src/game/combat";
import type { Enemy } from "../src/game/types";
import {
  BRUTE_HEALTH_DROP_AMOUNT,
  KILL_AMMO_DROP_AMOUNT,
  KILL_AMMO_DROP_INTERVAL,
  MILESTONE_TIME_SECONDS,
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

describe("5-minute milestone", () => {
  it("marks the milestone once elapsed crosses MILESTONE_TIME_SECONDS, without ending the run", () => {
    const state = createInitialState();
    const input = createInputState();
    state.elapsed = MILESTONE_TIME_SECONDS - 0.5;

    const before = update(state, input, 0.25);
    expect(before.milestoneReached).toBe(false);

    const after = update(before, input, 0.5);
    expect(after.milestoneReached).toBe(true);
    expect(after.milestoneBannerTimer).toBeGreaterThan(0);
    // Infinite survival: crossing the milestone never ends or pauses the run.
    expect(after.screen).toBe("playing");
  });

  it("only fires once — the banner timer counts down and reaching it again does not re-trigger it", () => {
    const state = createInitialState();
    state.elapsed = MILESTONE_TIME_SECONDS + 1;
    state.milestoneReached = true;
    state.milestoneBannerTimer = 0;

    const input = createInputState();
    const next = update(state, input, 1 / 60);
    expect(next.milestoneBannerTimer).toBe(0);
  });
});

describe("results-screen transition", () => {
  it("endRunNow snapshots the current run into state.results and switches to the results screen", () => {
    const state = createInitialState();
    state.score = 1234;
    state.wave.number = 3;
    state.stats.totalKills = 7;
    state.bestMultiplier = 2;

    endRunNow(state);

    expect(state.screen).toBe("results");
    expect(state.results).not.toBeNull();
    expect(state.results!.score).toBe(1234);
    expect(state.results!.wave).toBe(3);
    expect(state.results!.totalKills).toBe(7);
  });
});

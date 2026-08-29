// Selective hit-stop regression tests (crit-5 sustained-fire stutter fix #3).
// Before this fix, a nonzero hitStopTimer early-returned the *entire*
// update() — freezing player input, movement, fire cooldown, elapsed time,
// and HUD/audio right along with the enemies, which is what made every kill
// read as a stutter. update() now only skips the enemy/world-side systems
// (updateEnemies, resolveEntitySeparation, updateProjectiles, updateParticles)
// while hitStopTimer is active; everything the player directly feels keeps
// running every frame.
import { describe, expect, it } from "vitest";
import { createInitialState, update } from "../src/game/state";
import { createInputState } from "../src/game/input";
import { applyHitscanDamage } from "../src/game/combat";
import { spawnEnemy } from "../src/game/enemies";
import { HITSTOP_KILL_BRUTE, HITSTOP_KILL_NORMAL } from "../src/game/constants";
import type { GameState } from "../src/game/types";

function withActiveHitStop(): GameState {
  const state = createInitialState();
  state.hitStopTimer = HITSTOP_KILL_NORMAL;
  return state;
}

describe("selective hit-stop", () => {
  it("keeps fireCooldown decreasing every frame during an active hit-stop", () => {
    const state = withActiveHitStop();
    state.player.fireCooldown = 1;
    const next = update(state, createInputState(), 1 / 60);
    expect(next.player.fireCooldown).toBeLessThan(1);
  });

  it("keeps fireAnimationTimer decreasing every frame during an active hit-stop", () => {
    const state = withActiveHitStop();
    state.player.fireAnimationTimer = 0.5;
    const next = update(state, createInputState(), 1 / 60);
    expect(next.player.fireAnimationTimer).toBeLessThan(0.5);
  });

  it("still applies player movement input during an active hit-stop", () => {
    const state = withActiveHitStop();
    state.player.angle = 0;
    const startX = state.player.pos.x;
    const input = createInputState();
    input.forward = true;

    const next = update(state, input, 1 / 60);
    expect(next.player.pos.x).toBeGreaterThan(startX);
  });

  it("still applies player turning input during an active hit-stop", () => {
    const state = withActiveHitStop();
    const startAngle = state.player.angle;
    const input = createInputState();
    input.turnRight = true;

    const next = update(state, input, 1 / 60);
    expect(next.player.angle).toBeGreaterThan(startAngle);
  });

  it("keeps elapsed game time increasing every frame during an active hit-stop", () => {
    const state = withActiveHitStop();
    const startElapsed = state.elapsed;
    const next = update(state, createInputState(), 1 / 60);
    expect(next.elapsed).toBeGreaterThan(startElapsed);
  });

  it("pauses enemy-side movement while hit-stop is active, and resumes once it fully drains", () => {
    const state = createInitialState();
    const chaser = spawnEnemy("grunt", { x: 4, y: 4 }, { speed: 5 });
    chaser.state = "alert"; // isolate hit-stop's movement pause from LOS/alerting
    state.enemies = [chaser];
    state.hitStopTimer = HITSTOP_KILL_NORMAL;
    const input = createInputState();

    const duringHitstop = update(state, input, 1 / 60);
    expect(duringHitstop.enemies[0]!.pos).toEqual({ x: 4, y: 4 });

    let current = duringHitstop;
    for (let i = 0; i < 90; i++) current = update(current, input, 1 / 60);
    expect(current.enemies[0]!.pos).not.toEqual({ x: 4, y: 4 });
  });

  it("never lets hit-stop exceed the larger of HITSTOP_KILL_NORMAL/HITSTOP_KILL_BRUTE, and always fully drains back to zero", () => {
    const cap = Math.max(HITSTOP_KILL_NORMAL, HITSTOP_KILL_BRUTE);
    const state = createInitialState();
    state.hitStopTimer = cap;
    const input = createInputState();

    let current = state;
    for (let i = 0; i < 300; i++) {
      current = update(current, input, 1 / 60);
      expect(current.hitStopTimer).toBeLessThanOrEqual(cap + 1e-9);
    }
    expect(current.hitStopTimer).toBe(0);
  });

  it("a single enemy death triggers hit-stop exactly once — reprocessing the same now-dead enemy never refreshes or extends it", () => {
    const state = createInitialState();
    state.hitStopTimer = 0;
    const enemy = spawnEnemy("grunt", { x: 5, y: 5 }); // 1 HP — one hit is lethal
    state.enemies = [enemy];

    applyHitscanDamage(state, enemy, 100);
    expect(enemy.alive).toBe(false);
    expect(state.hitStopTimer).toBeCloseTo(HITSTOP_KILL_NORMAL);

    // Simulate hit-stop having already fully drained, then reprocess the
    // same dead enemy (as a stray hitscan or a re-run of the same frame's
    // logic might) — this must never push hitStopTimer back up, since a
    // dead enemy's health/alive can never satisfy the lethal branch again.
    state.hitStopTimer = 0;
    applyHitscanDamage(state, enemy, 100);
    expect(state.hitStopTimer).toBe(0);
  });

  it("consecutive kills in the same frame never stack hit-stop beyond the single larger value", () => {
    const state = createInitialState();
    state.hitStopTimer = 0;
    const grunt = spawnEnemy("grunt", { x: 5, y: 5 });
    const brute = spawnEnemy("brute", { x: 6, y: 6 });
    state.enemies = [grunt, brute];

    applyHitscanDamage(state, grunt, 100);
    applyHitscanDamage(state, brute, 100);

    expect(state.hitStopTimer).toBeCloseTo(HITSTOP_KILL_BRUTE);
    expect(state.hitStopTimer).toBeLessThanOrEqual(Math.max(HITSTOP_KILL_NORMAL, HITSTOP_KILL_BRUTE) + 1e-9);
  });
});

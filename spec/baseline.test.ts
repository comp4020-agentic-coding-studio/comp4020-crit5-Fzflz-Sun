// Sensor: the numbers a cold-start player is promised (full health, a full
// magazine, a fixed enemy count) and the guarantee that the very first enemy
// is a safe, aimed freebie. These are cheap to silently drift as the level or
// enemy defs change, and nothing else catches that drift — this does.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { STARTING_AMMO, STARTING_HEALTH } from "../src/game/constants";

describe("createInitialState baseline", () => {
  it("starts the player at full health and a full magazine", () => {
    const state = createInitialState();
    expect(state.player.health).toBe(STARTING_HEALTH);
    expect(state.player.ammo).toBe(STARTING_AMMO);
    expect(state.phase).toBe("playing");
  });

  it("spawns exactly seven living enemies", () => {
    const state = createInitialState();
    expect(state.enemies).toHaveLength(7);
    expect(state.enemies.every((e) => e.alive)).toBe(true);
  });

  it("aims the player straight at the first (intro) enemy with no turning needed", () => {
    const state = createInitialState();
    const intro = state.enemies[0]!;
    const dx = intro.pos.x - state.player.pos.x;
    const dy = intro.pos.y - state.player.pos.y;
    const angleToIntro = Math.atan2(dy, dx);
    // A stranger's very first Space-press must land without any turning —
    // that's the whole tutorial. Half a degree of slack for future tuning.
    expect(Math.abs(angleToIntro - state.player.angle)).toBeLessThan((0.5 * Math.PI) / 180);
  });

  it("keeps the intro enemy slow enough to give a stranger several seconds of safety", () => {
    const state = createInitialState();
    const intro = state.enemies[0]!;
    expect(intro.speed).toBeLessThan(0.2);
  });
});

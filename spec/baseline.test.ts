// Sensor: the numbers a cold-start player is promised (full health, a full
// magazine, an empty battlefield) and that a fresh run boots straight into
// wave 1's combat phase with the Director not yet having spawned anything.
// These checks are cheap to silently drift as constants/wave defaults change,
// and nothing else catches that drift — this does.
import { describe, expect, it } from "vitest";
import { createInitialState, createTitleState } from "../src/game/state";
import { STARTING_AMMO, STARTING_HEALTH } from "../src/game/constants";

describe("createInitialState baseline", () => {
  it("starts the player at full health and a full magazine, screen already playing", () => {
    const state = createInitialState();
    expect(state.player.health).toBe(STARTING_HEALTH);
    expect(state.player.ammo).toBe(STARTING_AMMO);
    expect(state.screen).toBe("playing");
  });

  it("starts with no enemies alive yet — the Director spawns wave 1's first enemy itself", () => {
    const state = createInitialState();
    expect(state.enemies).toHaveLength(0);
  });

  it("starts on wave 1's combat phase with a fresh spawn timer", () => {
    const state = createInitialState();
    expect(state.wave.number).toBe(1);
    expect(state.wave.phase).toBe("combat");
    expect(state.wave.spawnTimer).toBeGreaterThan(0);
  });

  it("starts with zero score, stats, and no upgrades", () => {
    const state = createInitialState();
    expect(state.score).toBe(0);
    expect(state.stats.totalKills).toBe(0);
    expect(Object.values(state.upgrades).every((lvl) => lvl === 0)).toBe(true);
  });
});

describe("createTitleState", () => {
  it("builds a full playable world but starts on the title screen", () => {
    const state = createTitleState();
    expect(state.screen).toBe("title");
    expect(state.player.health).toBe(STARTING_HEALTH);
  });
});

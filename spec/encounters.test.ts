// The room-encounter/wave state machine (Section 2/6 of the crit-5 spec):
// stages advance in a fixed order, a wave's spawns never exceed the
// simultaneous-enemy cap even when the wave itself is bigger than the cap,
// and walking onto one upgrade pedestal both grants it and clears the other.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { updateEncounter, updatePedestals, PEDESTALS_1, WAVE_B1, WAVE_B2 } from "../src/game/encounters";
import { MAX_SIMULTANEOUS_ENEMIES } from "../src/game/constants";

describe("encounter stage progression", () => {
  it("advances tutorial -> upgrade1 once the intro enemy is dead, spawning both pedestals", () => {
    const state = createInitialState();
    state.enemies[0]!.alive = false;
    state.enemies[0]!.state = "dead";

    updateEncounter(state, 0);

    expect(state.encounter.stage).toBe("upgrade1");
    expect(state.pedestals).toHaveLength(2);
  });

  it("holds upgrade1 until a choice is actually made", () => {
    const state = createInitialState();
    state.encounter.stage = "upgrade1";

    updateEncounter(state, 0);
    expect(state.encounter.stage).toBe("upgrade1");

    state.upgradeChoice1 = "rapid";
    updateEncounter(state, 0);
    expect(state.encounter.stage).toBe("freeRoam");
  });

  it("only enters Room B and queues wave 1 once the player actually crosses the threshold", () => {
    const state = createInitialState();
    state.encounter.stage = "freeRoam";
    state.player.pos = { x: 10, y: 3 };

    updateEncounter(state, 0);
    expect(state.encounter.stage).toBe("freeRoam");

    state.player.pos = { x: 18, y: 3 };
    updateEncounter(state, 0);
    expect(state.encounter.stage).toBe("roomB");
    expect(state.encounter.waveQueue).toEqual(WAVE_B1);
  });

  it("only starts wave 2 after wave 1 fully clears, then reopens the gate for the second pedestal pair", () => {
    const state = createInitialState();
    state.encounter.stage = "roomB";
    state.encounter.waveIndex = 0;
    state.encounter.waveQueue = [];
    state.encounter.pending = [];
    state.enemies = [];

    // Wave 1 just cleared -> a pause starts, wave 2 must not be queued yet.
    updateEncounter(state, 0);
    expect(state.encounter.pauseTimer).toBeGreaterThan(0);
    expect(state.encounter.waveIndex).toBe(0);

    // Once the pause fully elapses, wave 2 is queued.
    updateEncounter(state, state.encounter.pauseTimer);
    expect(state.encounter.waveIndex).toBe(1);
    expect(state.encounter.waveQueue).toEqual(WAVE_B2);

    // Clearing wave 2 clears the room.
    state.encounter.waveQueue = [];
    state.encounter.pending = [];
    state.enemies = [];
    updateEncounter(state, 0);
    expect(state.encounter.stage).toBe("upgrade2");
    expect(state.pedestals).toHaveLength(2);
  });
});

describe("simultaneous enemy cap", () => {
  it("never lets alive-plus-telegraphed enemies exceed the cap while a larger wave drains", () => {
    const state = createInitialState();
    state.encounter.stage = "roomB";
    state.encounter.waveIndex = 1;
    state.encounter.waveQueue = [...WAVE_B2]; // 4 spawn defs, bigger than the cap
    state.encounter.pending = [];
    state.enemies = [];

    for (let i = 0; i < 300; i++) {
      updateEncounter(state, 0.1);
      const inFlight = state.enemies.filter((e) => e.alive).length + state.encounter.pending.length;
      expect(inFlight).toBeLessThanOrEqual(MAX_SIMULTANEOUS_ENEMIES);
    }
  });
});

describe("upgrade pedestal selection", () => {
  it("grants only the pedestal walked onto and removes both from the world", () => {
    const state = createInitialState();
    state.pedestals = PEDESTALS_1.map((p) => ({ ...p, pos: { ...p.pos } }));
    state.player.pos = { ...PEDESTALS_1[0]!.pos };

    updatePedestals(state);

    expect(state.upgrades.rapid).toBe(true);
    expect(state.upgrades.impact).toBe(false);
    expect(state.upgradeChoice1).toBe("rapid");
    expect(state.pedestals).toHaveLength(0);
  });

  it("records the second choice separately from the first", () => {
    const state = createInitialState();
    state.upgradeChoice1 = "rapid";
    state.upgrades.rapid = true;
    state.pedestals = [{ id: 9, kind: "pierce", pos: { x: 2, y: 2 } }];
    state.player.pos = { x: 2, y: 2 };

    updatePedestals(state);

    expect(state.upgradeChoice1).toBe("rapid");
    expect(state.upgradeChoice2).toBe("pierce");
  });
});

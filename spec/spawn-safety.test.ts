// Pre-spawn safety regression tests (crit-5 perf fix #2, spawn half). Before
// this fix a wave could spawn an enemy embedded in a wall, stacked exactly on
// the player, or overlapping another alive enemy. The fix checks each
// intended spawn point against a small fixed fallback-offset list and, if
// every candidate is unsafe, defers the spawn by a short fixed delay instead
// of spinning or spawning unsafely. These tests drive updateEncounter's real
// wave-spawning path (updateWaveSpawning / isSpawnPositionSafe /
// findSafeSpawnPos are internal, so they're exercised through the public
// stage machine, same as the existing "simultaneous enemy cap" test).
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { spawnEnemy } from "../src/game/enemies";
import { updateEncounter } from "../src/game/encounters";
import { SPAWN_RETRY_DELAY } from "../src/game/constants";

function armRoomBSpawning(state: ReturnType<typeof createInitialState>): void {
  state.encounter.stage = "roomB";
  state.encounter.pauseTimer = 0;
  state.encounter.waveIndex = 1;
  state.encounter.waveQueue = [];
  state.enemies = [];
}

describe("pre-spawn safety", () => {
  it("never spawns an enemy embedded in a wall — defers with the bounded retry delay instead", () => {
    const state = createInitialState();
    armRoomBSpawning(state);
    state.player.pos = { x: 3, y: 3.5 }; // far from the test point, in room A

    const wallPos = { x: 13, y: 9 }; // solid: between rooms, not carved by any corridor
    state.encounter.pending = [{ kind: "grunt", pos: wallPos, telegraphTimer: 0 }];

    updateEncounter(state, 0.001);

    expect(state.enemies).toHaveLength(0);
    expect(state.encounter.pending).toHaveLength(1);
    expect(state.encounter.pending[0]!.telegraphTimer).toBeCloseTo(SPAWN_RETRY_DELAY, 5);
  });

  it("never spawns an enemy on top of the player, and spawns once the player moves away", () => {
    const state = createInitialState();
    armRoomBSpawning(state);

    const spawnPos = { x: 5, y: 5 }; // open room-A interior
    state.player.pos = { ...spawnPos }; // player is standing exactly on the intended spawn point
    state.encounter.pending = [{ kind: "grunt", pos: spawnPos, telegraphTimer: 0 }];

    updateEncounter(state, 0.001);

    expect(state.enemies).toHaveLength(0);
    expect(state.encounter.pending).toHaveLength(1);
    expect(state.encounter.pending[0]!.telegraphTimer).toBeCloseTo(SPAWN_RETRY_DELAY, 5);

    // The player walks away; the same intended point is now clear.
    state.player.pos = { x: 8, y: 2 };
    updateEncounter(state, state.encounter.pending[0]!.telegraphTimer);

    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]!.pos).toEqual(spawnPos);
    expect(state.encounter.pending).toHaveLength(0);
  });

  it("never spawns an enemy overlapping another alive enemy — falls back to the nearest safe offset", () => {
    const state = createInitialState();
    armRoomBSpawning(state);
    state.player.pos = { x: 20, y: 2 }; // far from the test point

    const spot = { x: 5, y: 5 }; // open room-A interior
    const existing = spawnEnemy("grunt", { ...spot });
    state.enemies = [existing];
    state.encounter.pending = [{ kind: "grunt", pos: spot, telegraphTimer: 0 }];

    updateEncounter(state, 0.001);

    // The base point and the two closest fallback offsets (0.6 away) are all
    // still within SPAWN_SAFE_ENEMY_DIST of the existing enemy — only the
    // diagonal (0.6, 0.6) offset (~0.849 away) clears it.
    const spawned = state.enemies.find((e) => e !== existing);
    expect(spawned).toBeDefined();
    expect(spawned!.pos.x).toBeCloseTo(spot.x + 0.6, 5);
    expect(spawned!.pos.y).toBeCloseTo(spot.y + 0.6, 5);
    expect(state.encounter.pending).toHaveLength(0);
  });
});

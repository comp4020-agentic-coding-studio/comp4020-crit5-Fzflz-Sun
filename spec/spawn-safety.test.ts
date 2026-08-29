// Pre-spawn safety regression tests (Section 4 of the crit-5 infinite-survival
// spec) — rewritten against the actual Spawn Director API (director.ts's
// pickSpawnAnchor), which replaced the old fallback-offset/pending-retry
// mechanism entirely. A candidate anchor is rejected outright if it sits in a
// solid cell, is nearer than SPAWN_MIN_PLAYER_DIST to the player, is visible
// to the player and not far enough to read as a fair telegraph, is on
// cooldown, or was used in one of the last few spawns.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { pickSpawnAnchor } from "../src/game/director";
import { isSolid } from "../src/game/level";
import { SPAWN_MIN_PLAYER_DIST } from "../src/game/constants";
import type { LevelMap, SpawnAnchor } from "../src/game/types";

function testMap(overrides: Partial<LevelMap> = {}): LevelMap {
  return {
    width: 30,
    height: 20,
    cells: Array.from({ length: 600 }, () => 0),
    doors: [],
    exit: { x: 29, y: 19 },
    zones: [{ id: "z1", name: "Test Zone", x0: 0, y0: 0, x1: 30, y1: 20 }],
    anchors: [],
    ...overrides,
  };
}

function wallAt(map: LevelMap, x: number, y: number): LevelMap {
  const cells = [...map.cells];
  cells[y * map.width + x] = 1;
  return { ...map, cells };
}

function anchor(id: number, x: number, y: number): SpawnAnchor {
  return { id, pos: { x, y }, zoneId: "z1" };
}

describe("pre-spawn safety — pickSpawnAnchor", () => {
  it("never returns an anchor embedded in a solid cell", () => {
    let map = testMap({ anchors: [anchor(1, 5, 5)] });
    map = wallAt(map, 5, 5);
    const state = createInitialState();
    state.map = map;
    state.player.pos = { x: 25, y: 15 }; // far from the walled anchor

    expect(isSolid(map, 5, 5)).toBe(true);
    expect(pickSpawnAnchor(state)).toBeNull();
  });

  it("never returns an anchor closer than SPAWN_MIN_PLAYER_DIST to the player", () => {
    const map = testMap({ anchors: [anchor(1, 5, 5)] });
    const state = createInitialState();
    state.map = map;
    state.player.pos = { x: 5.5, y: 5 }; // well inside the min-distance radius

    expect(pickSpawnAnchor(state)).toBeNull();
  });

  it("never returns an anchor that is visible and too close to read as a fair telegraph, even past the raw minimum distance", () => {
    const map = testMap({ anchors: [anchor(1, 5, 5 + SPAWN_MIN_PLAYER_DIST + 1)] });
    const state = createInitialState();
    state.map = map; // fully open map: the anchor is in clear line of sight
    state.player.pos = { x: 5, y: 5 };

    expect(pickSpawnAnchor(state)).toBeNull();
  });

  it("picks the only eligible anchor once it clears both distance and visibility slack", () => {
    const map = testMap({ anchors: [anchor(1, 5, 5 + SPAWN_MIN_PLAYER_DIST + 4)] });
    const state = createInitialState();
    state.map = map;
    state.player.pos = { x: 5, y: 5 };

    const picked = pickSpawnAnchor(state);
    expect(picked?.id).toBe(1);
  });

  it("never returns an anchor currently on cooldown", () => {
    const map = testMap({
      anchors: [anchor(1, 5, 5), anchor(2, 25, 5)],
    });
    const state = createInitialState();
    state.map = map;
    state.player.pos = { x: 15, y: 18 };
    state.director.anchorCooldowns = { 1: 3 };

    const picked = pickSpawnAnchor(state);
    expect(picked?.id).toBe(2);
  });

  it("never returns an anchor used in one of the last few spawns while an untouched alternative exists", () => {
    const map = testMap({
      anchors: [anchor(1, 5, 5), anchor(2, 25, 5)],
    });
    const state = createInitialState();
    state.map = map;
    state.player.pos = { x: 15, y: 18 };
    state.director.recentAnchors = [1];

    const picked = pickSpawnAnchor(state);
    expect(picked?.id).toBe(2);
  });

  it("returns null when every anchor is unsafe — never falls back to an unsafe spawn", () => {
    const map = testMap({ anchors: [anchor(1, 5, 5)] });
    const state = createInitialState();
    state.map = map;
    state.player.pos = { x: 5.2, y: 5 }; // the only anchor is inside the min-distance radius

    expect(pickSpawnAnchor(state)).toBeNull();
  });
});

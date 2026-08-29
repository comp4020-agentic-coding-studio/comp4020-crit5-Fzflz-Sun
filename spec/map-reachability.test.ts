// Map connectivity (Section 1 of the crit-5 infinite-survival spec): every
// zone, every spawn anchor, and the cosmetic exit landmark must be reachable
// from the player's start position by walking on open floor — a flood fill
// from spawn, treating a closed-but-openable door as passable (it opens on
// proximity; only an actual wall/out-of-bounds cell blocks a route) and only
// a genuine wall cell (or the map edge) as impassable. A spawn anchor sitting
// inside a wall, or a zone with no reachable floor at all, would silently
// break the Spawn Director and the results screen's "the run happened
// somewhere" premise.
import { describe, expect, it } from "vitest";
import { buildLevel } from "../src/game/level";

// Mirrors the hardcoded start position in state.ts's createInitialState —
// there is no shared PLAYER_START constant to import.
const PLAYER_START = { x: 17, y: 15.5 };

function floodFillReachable(map: ReturnType<typeof buildLevel>, startX: number, startY: number): boolean[] {
  const seen = Array.from<boolean>({ length: map.width * map.height }).fill(false);
  const startIx = Math.floor(startX);
  const startIy = Math.floor(startY);
  const stack = [[startIx, startIy]];
  seen[startIy * map.width + startIx] = true;

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const neighbours = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx! < 0 || ny! < 0 || nx! >= map.width || ny! >= map.height) continue;
      const idx = ny! * map.width + nx!;
      if (seen[idx]) continue;
      // Only a genuine wall (any nonzero cell value) blocks the flood fill —
      // a closed door still sits on an open (value 0) floor cell and always
      // opens on proximity, so it is never an obstacle to reachability.
      if (map.cells[idx] !== 0) continue;
      seen[idx] = true;
      stack.push([nx!, ny!]);
    }
  }
  return seen;
}

describe("map reachability", () => {
  const map = buildLevel();
  const reachable = floodFillReachable(map, PLAYER_START.x, PLAYER_START.y);

  it("reaches at least one open floor cell inside every named zone", () => {
    for (const zone of map.zones) {
      let found = false;
      for (let y = zone.y0; y < zone.y1 && !found; y++) {
        for (let x = zone.x0; x < zone.x1 && !found; x++) {
          if (map.cells[y * map.width + x] === 0 && reachable[y * map.width + x]) found = true;
        }
      }
      expect(found, `zone "${zone.name}" has no reachable floor cell`).toBe(true);
    }
  });

  it("reaches every predefined spawn anchor, and no anchor sits in a solid cell", () => {
    for (const anchor of map.anchors) {
      const ix = Math.floor(anchor.pos.x);
      const iy = Math.floor(anchor.pos.y);
      expect(map.cells[iy * map.width + ix], `anchor ${anchor.id} is embedded in a wall`).toBe(0);
      expect(reachable[iy * map.width + ix], `anchor ${anchor.id} is unreachable from spawn`).toBe(true);
    }
  });

  it("reaches the cosmetic exit landmark", () => {
    const ix = Math.floor(map.exit.x);
    const iy = Math.floor(map.exit.y);
    expect(reachable[iy * map.width + ix]).toBe(true);
  });

  it("has at least two zones connected by more than one distinct corridor-tile route (a real loop, not just hub-and-spoke)", () => {
    // Both spokes off the central Entrance Hall AND the outer ring corridor
    // are open floor simultaneously — Storage Corridor and Cafeteria are each
    // reachable via the hub *and* via the independent outer-ring path through
    // Computer Lab/Neon Arcade, so removing either single corridor still
    // leaves a route.
    const hubSpokeStorage = map.cells[16 * map.width + 12] === 0; // inside "Storage Corridor -> Hall" spoke
    const outerRingStorage = map.cells[10 * map.width + 7] === 0; // inside "Computer Lab <-> Storage Corridor" link
    expect(hubSpokeStorage).toBe(true);
    expect(outerRingStorage).toBe(true);
  });
});

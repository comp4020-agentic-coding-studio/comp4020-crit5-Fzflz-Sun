// The one game rule under a focused automated test (this week's spec line):
// a shot can only damage the nearest visible enemy on the ray, and a wall in
// front of an enemy makes it untouchable. Deterministic synthetic maps and
// game state only — no canvas, no animation timing, no screenshots.
import { describe, expect, it } from "vitest";
import { resolveHitscan } from "../src/game/combat";
import type { Enemy, LevelMap } from "../src/game/types";

const OPEN_MAP: LevelMap = {
  width: 10,
  height: 3,
  cells: Array.from({ length: 30 }, () => 0),
  doors: [],
  exit: { x: 9, y: 1 },
};

function wallAt(map: LevelMap, x: number, y: number): LevelMap {
  const cells = [...map.cells];
  cells[y * map.width + x] = 1;
  return { ...map, cells };
}

function makeEnemy(overrides: Partial<Enemy>): Enemy {
  return {
    id: 1,
    kind: "grunt",
    pos: { x: 5, y: 1 },
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
    ...overrides,
  };
}

const ORIGIN = { x: 1, y: 1 };
const RIGHT_ANGLE = 0; // facing +x, straight down the open row (y=1)
const RANGE = 12;
const TOLERANCE = (5 * Math.PI) / 180;

describe("resolveHitscan", () => {
  it("hits an unoccluded enemy directly ahead", () => {
    const enemy = makeEnemy({ pos: { x: 5, y: 1 } });
    const hit = resolveHitscan(OPEN_MAP, ORIGIN, RIGHT_ANGLE, [enemy], RANGE, TOLERANCE);
    expect(hit).toBe(enemy);
  });

  it("does not hit an enemy behind a wall, however close", () => {
    const map = wallAt(OPEN_MAP, 3, 1); // wall at x=3, enemy at x=5 — wall is nearer
    const enemy = makeEnemy({ pos: { x: 5, y: 1 } });
    const hit = resolveHitscan(map, ORIGIN, RIGHT_ANGLE, [enemy], RANGE, TOLERANCE);
    expect(hit).toBeNull();
  });

  it("hits the nearer enemy, not a farther one on the same ray", () => {
    const near = makeEnemy({ id: 1, pos: { x: 4, y: 1 } });
    const far = makeEnemy({ id: 2, pos: { x: 8, y: 1 } });
    const hit = resolveHitscan(OPEN_MAP, ORIGIN, RIGHT_ANGLE, [near, far], RANGE, TOLERANCE);
    expect(hit).toBe(near);
  });

  it("ignores an enemy outside the aim tolerance even if unoccluded and in range", () => {
    const offToTheSide = makeEnemy({ pos: { x: 5, y: 2.6 } }); // well off the ray at y=1
    const hit = resolveHitscan(OPEN_MAP, ORIGIN, RIGHT_ANGLE, [offToTheSide], RANGE, TOLERANCE);
    expect(hit).toBeNull();
  });

  it("ignores a dead enemy even if it would otherwise be the nearest hit", () => {
    const dead = makeEnemy({ id: 1, pos: { x: 4, y: 1 }, alive: false, state: "dead" });
    const alive = makeEnemy({ id: 2, pos: { x: 6, y: 1 } });
    const hit = resolveHitscan(OPEN_MAP, ORIGIN, RIGHT_ANGLE, [dead, alive], RANGE, TOLERANCE);
    expect(hit).toBe(alive);
  });

  it("does not hit past maxRange", () => {
    const farAway = makeEnemy({ pos: { x: 20, y: 1 } });
    const hit = resolveHitscan(OPEN_MAP, ORIGIN, RIGHT_ANGLE, [farAway], RANGE, TOLERANCE);
    expect(hit).toBeNull();
  });
});

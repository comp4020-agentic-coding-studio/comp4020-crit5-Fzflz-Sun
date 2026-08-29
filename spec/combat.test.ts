// The one game rule under a focused automated test (this week's spec line):
// a shot can only damage the nearest visible enemy on the ray, and a wall in
// front of an enemy makes it untouchable. Deterministic synthetic maps and
// game state only — no canvas, no animation timing, no screenshots.
//
// Also covers the crit-5 additions layered on top of the same hitscan: the
// PIERCE upgrade (a shot can hit a second enemy, but never the same one
// twice) and shoot-down-projectiles (destroying an incoming shot takes
// priority over an enemy hit, and never does both in one shot).
import { describe, expect, it } from "vitest";
import { handlePlayerFire, resolveHitscan } from "../src/game/combat";
import { createInitialState } from "../src/game/state";
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
    projectileDamage: 1,
    telegraphTimer: 0,
    contactCooldown: 0,
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

describe("PIERCE upgrade", () => {
  it("hits up to two enemies in one shot, each exactly once — never a double-hit on either", () => {
    const state = createInitialState();
    state.map = OPEN_MAP;
    state.player.pos = { x: 1, y: 1 };
    state.player.angle = 0;
    state.player.ammo = 5;
    state.upgrades.pierce = true;

    const near = makeEnemy({ id: 1, pos: { x: 4, y: 1 }, health: 1, maxHealth: 1 });
    const far = makeEnemy({ id: 2, pos: { x: 8, y: 1 }, health: 1, maxHealth: 1 });
    state.enemies = [near, far];
    state.projectiles = [];

    handlePlayerFire(state, 0);

    expect(near.alive).toBe(false);
    expect(far.alive).toBe(false);
    // Two separate one-hit kills, not one enemy counted twice.
    expect(state.killCount).toBe(2);
  });

  it("without PIERCE, the same shot only ever reaches the nearest enemy", () => {
    const state = createInitialState();
    state.map = OPEN_MAP;
    state.player.pos = { x: 1, y: 1 };
    state.player.angle = 0;
    state.player.ammo = 5;

    const near = makeEnemy({ id: 1, pos: { x: 4, y: 1 }, health: 1, maxHealth: 1 });
    const far = makeEnemy({ id: 2, pos: { x: 8, y: 1 }, health: 1, maxHealth: 1 });
    state.enemies = [near, far];
    state.projectiles = [];

    handlePlayerFire(state, 0);

    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
  });
});

describe("shoot-down-projectiles", () => {
  it("destroys an incoming projectile instead of hitting an enemy standing behind it, with no double-hit", () => {
    const state = createInitialState();
    state.map = OPEN_MAP;
    state.player.pos = { x: 1, y: 1 };
    state.player.angle = 0;
    state.player.ammo = 5;

    const behind = makeEnemy({ id: 1, pos: { x: 8, y: 1 }, health: 1, maxHealth: 1 });
    state.enemies = [behind];
    state.projectiles = [{ id: 1, pos: { x: 4, y: 1 }, vel: { x: -1, y: 0 }, ttl: 5, damage: 5 }];

    handlePlayerFire(state, 0);

    expect(state.projectiles).toHaveLength(0);
    expect(state.projectilesDestroyed).toBe(1);
    // Priority is destroy-then-return: the enemy behind the projectile is
    // never also hit by the same shot.
    expect(behind.alive).toBe(true);
    expect(behind.health).toBe(1);
  });

  it("falls back to hitting an enemy when there is no projectile in the way", () => {
    const state = createInitialState();
    state.map = OPEN_MAP;
    state.player.pos = { x: 1, y: 1 };
    state.player.angle = 0;
    state.player.ammo = 5;

    const enemy = makeEnemy({ id: 1, pos: { x: 4, y: 1 }, health: 1, maxHealth: 1 });
    state.enemies = [enemy];
    state.projectiles = [];

    handlePlayerFire(state, 0);

    expect(enemy.alive).toBe(false);
    expect(state.projectilesDestroyed).toBe(0);
  });
});

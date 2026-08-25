// The one level: four connected rooms carved onto a grid, deterministically
// (no randomness) so the layout is the same every run and every test.
import type { Cell, Door, LevelMap } from "./types";

const WIDTH = 23;
const HEIGHT = 15;

function index(x: number, y: number): number {
  return y * WIDTH + x;
}

function carve(cells: Cell[], x0: number, y0: number, w: number, h: number, value: Cell = 0): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      cells[index(x, y)] = value;
    }
  }
}

/** Builds the level fresh — call this on every restart, not just once, so a
 * dead enemy or a spent pickup from a previous run never carries over. */
export function buildLevel(): LevelMap {
  const cells: Cell[] = Array.from({ length: WIDTH * HEIGHT }, () => 1);

  // Room A: start room (top-left). Room B: top-right. Room D: bottom-left.
  // Room C: bottom-right, holds the exit. A ring of corridors connects all
  // four, so the map has more than one route once you're past the doors.
  carve(cells, 1, 1, 6, 5); // Room A
  carve(cells, 14, 1, 7, 5); // Room B
  carve(cells, 1, 9, 6, 5); // Room D
  carve(cells, 14, 9, 7, 5); // Room C

  carve(cells, 7, 3, 7, 1); // corridor A -> B (door at x=10)
  carve(cells, 17, 6, 1, 3); // corridor B -> C, open
  carve(cells, 3, 6, 1, 3); // corridor A -> D (door at y=7)
  carve(cells, 7, 11, 7, 1); // corridor D -> C, open

  // A couple of interior wall-variant B accents so the raycaster's two wall
  // textures both show up before real art exists. Kept off the main sight
  // lines (row y=3 into room B, and the exit cell itself) so they read as
  // scenery, not accidental cover or a blocked win condition.
  cells[index(16, 5)] = 2;
  cells[index(15, 10)] = 2;

  const doors: Door[] = [
    { x: 10, y: 3, open: false },
    { x: 3, y: 7, open: false },
  ];

  return {
    width: WIDTH,
    height: HEIGHT,
    cells,
    doors,
    exit: { x: 19, y: 11 },
  };
}

export function cellAt(map: LevelMap, x: number, y: number): Cell | undefined {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.width || iy >= map.height) return undefined;
  return map.cells[iy * map.width + ix];
}

export function doorAt(map: LevelMap, x: number, y: number): Door | undefined {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return map.doors.find((d) => d.x === ix && d.y === iy);
}

/** True if a point (or the discrete cell it falls in) blocks movement and
 * sight: an out-of-bounds cell, a wall cell, or a still-closed door. */
export function isSolid(map: LevelMap, x: number, y: number): boolean {
  const cell = cellAt(map, x, y);
  if (cell === undefined) return true;
  if (cell !== 0) return true;
  const door = doorAt(map, x, y);
  return door !== undefined && !door.open;
}

function isSolidForRadius(map: LevelMap, cx: number, cy: number, radius: number): boolean {
  return (
    isSolid(map, cx, cy) ||
    isSolid(map, cx + radius, cy) ||
    isSolid(map, cx - radius, cy) ||
    isSolid(map, cx, cy + radius) ||
    isSolid(map, cx, cy - radius)
  );
}

/** Axis-separated move-and-collide: slide along a wall on one axis instead
 * of stopping dead when a diagonal move would clip a corner. */
export function moveWithCollision(map: LevelMap, pos: { x: number; y: number }, dx: number, dy: number, radius: number): { x: number; y: number } {
  let { x, y } = pos;
  const nx = x + dx;
  if (!isSolidForRadius(map, nx, y, radius)) x = nx;
  const ny = y + dy;
  if (!isSolidForRadius(map, x, ny, radius)) y = ny;
  return { x, y };
}

/** Opens any door within reach of a point. Doors stay open once triggered —
 * this is a toy lab, not a stealth game, and re-closing adds a rule the
 * no-tutorial opening screen would have no way to teach. */
export function updateDoors(map: LevelMap, point: { x: number; y: number }, radius: number): void {
  for (const door of map.doors) {
    if (door.open) continue;
    const dx = door.x + 0.5 - point.x;
    const dy = door.y + 0.5 - point.y;
    if (Math.hypot(dx, dy) <= radius) door.open = true;
  }
}

// The one level: four wide, deliberately oversized school rooms carved onto a
// grid, connected by a ring of 3-tile-wide corridors, deterministically (no
// randomness) so the layout is the same every run and every test.
import type { Cell, Door, LevelMap } from "./types";

const WIDTH = 27;
const HEIGHT = 19;

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

  // Room A: Entrance Hall (top-left, start room). Room B: Locker Corridor
  // (top-right, a wide walkway rather than a tight passage). Room D: Lab
  // Classroom (bottom-left). Room C: Activity Room (bottom-right, holds the
  // exit). All four rooms are 9x7 — big and mostly empty on purpose, so a
  // small on-screen character reads as small in a big room.
  carve(cells, 1, 1, 9, 7); // Room A — Entrance Hall
  carve(cells, 17, 1, 9, 7); // Room B — Locker Corridor
  carve(cells, 1, 11, 9, 7); // Room D — Lab Classroom
  carve(cells, 17, 11, 9, 7); // Room C — Activity Room

  // A ring of 3-tile-wide corridors connects all four rooms, so there are two
  // routes from the entrance to the exit (via B, or via D) plus the loop
  // formed by the ring itself.
  carve(cells, 10, 3, 7, 3); // corridor A -> B (door at x=10)
  carve(cells, 20, 8, 3, 3); // corridor B -> C, open
  carve(cells, 4, 8, 3, 3); // corridor A -> D (door at y=8)
  carve(cells, 10, 13, 7, 3); // corridor D -> C, open

  // A couple of interior wall-variant B accents so the raycaster's two wall
  // textures both show up somewhere in the level. Tucked into far corners,
  // clear of every doorway, sightline and enemy spawn: a cell merely diagonal
  // to a corridor mouth still snags the player's circular collision radius
  // when hugging that wall, even though the doorway itself is unobstructed.
  cells[index(24, 1)] = 2;
  cells[index(24, 17)] = 2;

  const doors: Door[] = [
    { x: 10, y: 3, open: false },
    { x: 10, y: 4, open: false },
    { x: 10, y: 5, open: false },
    { x: 4, y: 8, open: false },
    { x: 5, y: 8, open: false },
    { x: 6, y: 8, open: false },
  ];

  return {
    width: WIDTH,
    height: HEIGHT,
    cells,
    doors,
    exit: { x: 21, y: 14 },
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

// A circle merely grazing a wall perpendicular to its travel (its edge
// exactly touching, not overlapping) must not block sliding along that wall
// — otherwise a player who drifts close enough to graze a corridor wall
// freezes solid despite holding forward, since the axis they *are* moving on
// keeps failing the perpendicular sample from the wall they're merely
// touching. Easing the perpendicular sample in by CORNER_EASE lets a graze
// (up to that much overlap) pass, while the primary-direction sample below
// still uses the full radius, so real head-on collision is unaffected.
const CORNER_EASE = 0.05;

function isSolidAlongX(map: LevelMap, cx: number, cy: number, radius: number): boolean {
  return (
    isSolid(map, cx, cy) ||
    isSolid(map, cx + radius, cy) ||
    isSolid(map, cx - radius, cy) ||
    isSolid(map, cx, cy + radius - CORNER_EASE) ||
    isSolid(map, cx, cy - radius + CORNER_EASE)
  );
}

function isSolidAlongY(map: LevelMap, cx: number, cy: number, radius: number): boolean {
  return (
    isSolid(map, cx, cy) ||
    isSolid(map, cx, cy + radius) ||
    isSolid(map, cx, cy - radius) ||
    isSolid(map, cx + radius - CORNER_EASE, cy) ||
    isSolid(map, cx - radius + CORNER_EASE, cy)
  );
}

/** Axis-separated move-and-collide: slide along a wall on one axis instead
 * of stopping dead when a diagonal move would clip a corner. */
export function moveWithCollision(map: LevelMap, pos: { x: number; y: number }, dx: number, dy: number, radius: number): { x: number; y: number } {
  let { x, y } = pos;
  const nx = x + dx;
  if (!isSolidAlongX(map, nx, y, radius)) x = nx;
  const ny = y + dy;
  if (!isSolidAlongY(map, x, ny, radius)) y = ny;
  return { x, y };
}

/** Opens any door within reach of a point. Doors stay open once triggered —
 * this game has no on-screen instructions to teach a re-closing rule, so it
 * doesn't have one.
 *
 * Distance is measured to the nearest point of the door's own unit cell, not
 * to its center: a wide doorway is several adjacent door cells side by side,
 * and center-distance leaves gaps directly between two centers (more than
 * `radius` from either) where the approaching player's own collision radius
 * stops them before they'd ever cross into any single door's trigger circle
 * — a softlock straight ahead of a multi-cell doorway. Clamping to the cell
 * first makes the trigger uniform across the doorway's full width. */
export function updateDoors(map: LevelMap, point: { x: number; y: number }, radius: number): void {
  for (const door of map.doors) {
    if (door.open) continue;
    const nearestX = Math.max(door.x, Math.min(point.x, door.x + 1));
    const nearestY = Math.max(door.y, Math.min(point.y, door.y + 1));
    const dx = nearestX - point.x;
    const dy = nearestY - point.y;
    if (Math.hypot(dx, dy) <= radius) door.open = true;
  }
}

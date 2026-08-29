// The infinite-survival map: a larger, loop-connected indoor layout carved
// onto a grid, deterministically (no randomness) so the layout is the same
// every run and every test. One central hub ("Entrance Hall") connects to
// three of the seven surrounding zones directly; those zones are also
// stitched together by an outer ring of corridors, so almost every pair of
// zones has at least two mutually-bypassable routes between them instead of
// a single hub-and-spoke path. Zone/anchor metadata (below) drives the Spawn
// Director's zone-diversity scoring and reachability tests — it adds no new
// rendering primitives, since zones read as distinct through layout, cover
// placement, and the existing wall-variant accent (value 2), not new
// textures.
import type { Cell, Door, LevelMap, SpawnAnchor, ZoneDef } from "./types";

const WIDTH = 43;
const HEIGHT = 31;

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

function block(cells: Cell[], x: number, y: number, value: Cell = 1): void {
  cells[index(x, y)] = value;
}

/** Builds the level fresh — call this on every new run, not just once, so a
 * dead enemy or a spent pickup from a previous run never carries over. */
export function buildLevel(): LevelMap {
  const cells: Cell[] = Array.from({ length: WIDTH * HEIGHT }, () => 1);

  // The eight named zones (Section 1's suggested list). Entrance Hall sits at
  // the map's geometric center and doubles as the central hall / open,
  // cover-filled high-pressure combat area; the other seven ring it.
  carve(cells, 16, 12, 12, 8); // Entrance Hall (central hub)
  carve(cells, 2, 1, 11, 9); // Computer Lab (top-left)
  carve(cells, 30, 1, 11, 9); // Neon Arcade (top-right)
  carve(cells, 2, 12, 9, 8); // Storage Corridor (mid-left)
  carve(cells, 32, 12, 9, 8); // Cafeteria (mid-right)
  carve(cells, 2, 22, 11, 8); // Activity Room (bottom-left)
  carve(cells, 16, 23, 12, 5); // Service Tunnel (bottom-center, narrow)
  carve(cells, 30, 22, 11, 8); // Final Assembly Hall (bottom-right)

  // Hub spokes: Entrance Hall <-> Storage Corridor / Cafeteria / Service
  // Tunnel. All 3-wide, all doored (see below).
  carve(cells, 11, 15, 5, 3); // Storage Corridor -> Hall
  carve(cells, 28, 15, 4, 3); // Hall -> Cafeteria
  carve(cells, 20, 20, 3, 3); // Hall -> Service Tunnel

  // Outer ring: connects the seven non-hub zones directly to each other,
  // independent of the hub, so a pair like Computer Lab/Neon Arcade has both
  // the long top corridor and a hub-via-Storage/Cafeteria route — at least 3
  // mutually-bypassable corridors and 2+ full loop routes in total.
  carve(cells, 13, 4, 17, 3); // Computer Lab <-> Neon Arcade (long top corridor, undoored)
  carve(cells, 6, 9, 3, 3); // Computer Lab <-> Storage Corridor
  carve(cells, 34, 9, 3, 3); // Neon Arcade <-> Cafeteria
  carve(cells, 4, 20, 3, 2); // Storage Corridor <-> Activity Room
  carve(cells, 34, 20, 3, 2); // Cafeteria <-> Final Assembly Hall
  carve(cells, 13, 24, 3, 3); // Activity Room <-> Service Tunnel
  carve(cells, 28, 24, 2, 3); // Service Tunnel <-> Final Assembly Hall

  // Two narrow, single-tile-wide dead-end alcoves off the outer ring —
  // resource-only side detours, not shortcuts (each is exactly one cell
  // wide, so nothing bypasses through one).
  carve(cells, 19, 1, 1, 3); // alcove off the Computer Lab <-> Neon Arcade corridor
  carve(cells, 22, 28, 1, 2); // alcove off Service Tunnel's south wall

  // Interior cover per zone — single blocked cells inside an otherwise open
  // room, placed for peekable geometry rather than raw stat buffs. Kept
  // clear of every doorway/corridor mouth and every spawn anchor below.
  block(cells, 5, 3);
  block(cells, 5, 6);
  block(cells, 9, 3);
  block(cells, 9, 6); // Computer Lab desk rows
  block(cells, 33, 3);
  block(cells, 36, 5);
  block(cells, 38, 3);
  block(cells, 34, 7); // Neon Arcade cabinet clutter
  block(cells, 18, 14);
  block(cells, 18, 17);
  block(cells, 22, 14);
  block(cells, 22, 17);
  block(cells, 25, 15);
  block(cells, 25, 18); // Entrance Hall — open, cover-filled high-pressure area
  block(cells, 4, 14);
  block(cells, 4, 17);
  block(cells, 8, 14);
  block(cells, 8, 17); // Storage Corridor shelving
  block(cells, 34, 14);
  block(cells, 34, 17);
  block(cells, 38, 14);
  block(cells, 38, 17); // Cafeteria tables
  block(cells, 5, 24);
  block(cells, 5, 27);
  block(cells, 9, 24);
  block(cells, 9, 27); // Activity Room equipment
  block(cells, 19, 25);
  block(cells, 24, 25); // Service Tunnel piping
  block(cells, 33, 24);
  block(cells, 33, 27);
  block(cells, 37, 24);
  block(cells, 37, 27); // Final Assembly Hall gantries

  // Wall-variant accents (value 2) — landmark texture cues, no new sprites.
  block(cells, 11, 2, 2);
  block(cells, 32, 2, 2);
  block(cells, 40, 8, 2);
  block(cells, 40, 28, 2);

  const doors: Door[] = [
    { x: 6, y: 10, open: false },
    { x: 7, y: 10, open: false },
    { x: 8, y: 10, open: false },
    { x: 34, y: 10, open: false },
    { x: 35, y: 10, open: false },
    { x: 36, y: 10, open: false },
    { x: 13, y: 15, open: false },
    { x: 13, y: 16, open: false },
    { x: 13, y: 17, open: false },
    { x: 29, y: 15, open: false },
    { x: 29, y: 16, open: false },
    { x: 29, y: 17, open: false },
    { x: 20, y: 21, open: false },
    { x: 21, y: 21, open: false },
    { x: 22, y: 21, open: false },
  ];

  const zones: ZoneDef[] = [
    { id: "entrance-hall", name: "Entrance Hall", x0: 16, y0: 12, x1: 28, y1: 20 },
    { id: "computer-lab", name: "Computer Lab", x0: 2, y0: 1, x1: 13, y1: 10 },
    { id: "neon-arcade", name: "Neon Arcade", x0: 30, y0: 1, x1: 41, y1: 10 },
    { id: "storage-corridor", name: "Storage Corridor", x0: 2, y0: 12, x1: 11, y1: 20 },
    { id: "cafeteria", name: "Cafeteria", x0: 32, y0: 12, x1: 41, y1: 20 },
    { id: "activity-room", name: "Activity Room", x0: 2, y0: 22, x1: 13, y1: 30 },
    { id: "service-tunnel", name: "Service Tunnel", x0: 16, y0: 23, x1: 28, y1: 28 },
    { id: "final-assembly-hall", name: "Final Assembly Hall", x0: 30, y0: 22, x1: 41, y1: 30 },
  ];

  // 16 predefined spawn anchors, two per zone, each on open floor clear of
  // cover/doors — the Spawn Director never invents a spawn point at runtime.
  const anchorDefs: Array<{ x: number; y: number; zoneId: string }> = [
    { x: 17, y: 13, zoneId: "entrance-hall" },
    { x: 26, y: 18, zoneId: "entrance-hall" },
    { x: 3, y: 2, zoneId: "computer-lab" },
    { x: 11, y: 8, zoneId: "computer-lab" },
    { x: 31, y: 2, zoneId: "neon-arcade" },
    { x: 39, y: 8, zoneId: "neon-arcade" },
    { x: 3, y: 13, zoneId: "storage-corridor" },
    { x: 9, y: 18, zoneId: "storage-corridor" },
    { x: 33, y: 13, zoneId: "cafeteria" },
    { x: 39, y: 18, zoneId: "cafeteria" },
    { x: 3, y: 23, zoneId: "activity-room" },
    { x: 11, y: 28, zoneId: "activity-room" },
    { x: 17, y: 24, zoneId: "service-tunnel" },
    { x: 26, y: 26, zoneId: "service-tunnel" },
    { x: 31, y: 23, zoneId: "final-assembly-hall" },
    { x: 39, y: 23, zoneId: "final-assembly-hall" },
  ];
  const anchors: SpawnAnchor[] = anchorDefs.map((a, id) => ({ id, pos: { x: a.x + 0.5, y: a.y + 0.5 }, zoneId: a.zoneId }));

  return {
    width: WIDTH,
    height: HEIGHT,
    cells,
    doors,
    // Purely a cosmetic finale landmark now — reaching it no longer ends the
    // run (see Section 7: the game has no fixed-content win condition).
    exit: { x: 35, y: 26 },
    zones,
    anchors,
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
    if (door.open || door.manual) continue;
    const nearestX = Math.max(door.x, Math.min(point.x, door.x + 1));
    const nearestY = Math.max(door.y, Math.min(point.y, door.y + 1));
    const dx = nearestX - point.x;
    const dy = nearestY - point.y;
    if (Math.hypot(dx, dy) <= radius) door.open = true;
  }
}

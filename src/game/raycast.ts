// DDA grid raycasting (the classic Wolfenstein-style algorithm: step to the
// next vertical or horizontal grid line, whichever is closer, until a solid
// cell is hit). Used by the renderer for wall columns, by enemy AI for line
// of sight, and by combat for the hitscan — one implementation, three
// callers, so a fix here fixes all three at once.
import type { LevelMap } from "./types";
import { doorAt, isSolid } from "./level";

export interface RayHit {
  /** Perpendicular distance to the hit (fisheye-free), or maxRange if the
   * ray reached maxRange without hitting anything. */
  distance: number;
  /** 0 = hit a north/south-facing wall face, 1 = east/west-facing. */
  side: 0 | 1;
  /** Wall variant hit, 3 for a closed door, -1 if nothing was hit. */
  cell: number;
  /** 0..1 position along the hit wall face, for texture placement. */
  wallX: number;
}

const EPSILON = 1e-9;

export function castRay(
  map: LevelMap,
  origin: { x: number; y: number },
  dirX: number,
  dirY: number,
  maxRange: number,
): RayHit {
  let mapX = Math.floor(origin.x);
  let mapY = Math.floor(origin.y);

  const deltaDistX = Math.abs(dirX) < EPSILON ? Number.MAX_VALUE : Math.abs(1 / dirX);
  const deltaDistY = Math.abs(dirY) < EPSILON ? Number.MAX_VALUE : Math.abs(1 / dirY);

  let stepX: number;
  let sideDistX: number;
  if (dirX < 0) {
    stepX = -1;
    sideDistX = (origin.x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - origin.x) * deltaDistX;
  }

  let stepY: number;
  let sideDistY: number;
  if (dirY < 0) {
    stepY = -1;
    sideDistY = (origin.y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - origin.y) * deltaDistY;
  }

  let side: 0 | 1 = 0;
  const maxSteps = map.width + map.height + Math.ceil(maxRange) + 4;

  for (let steps = 0; steps < maxSteps; steps++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    if (mapX < 0 || mapY < 0 || mapX >= map.width || mapY >= map.height) {
      return { distance: maxRange, side, cell: -1, wallX: 0 };
    }

    if (isSolid(map, mapX, mapY)) {
      const perp =
        side === 0
          ? (mapX - origin.x + (1 - stepX) / 2) / dirX
          : (mapY - origin.y + (1 - stepY) / 2) / dirY;

      if (!(perp >= 0) || perp > maxRange) {
        return { distance: maxRange, side, cell: -1, wallX: 0 };
      }

      let wallX = side === 0 ? origin.y + perp * dirY : origin.x + perp * dirX;
      wallX -= Math.floor(wallX);

      const door = doorAt(map, mapX, mapY);
      const cellValue = map.cells[mapY * map.width + mapX];
      const cell = door && !door.open ? 3 : cellValue;

      return { distance: perp, side, cell, wallX };
    }
  }

  return { distance: maxRange, side, cell: -1, wallX: 0 };
}

export function castRayAngle(map: LevelMap, origin: { x: number; y: number }, angle: number, maxRange: number): RayHit {
  return castRay(map, origin, Math.cos(angle), Math.sin(angle), maxRange);
}

export function castRayDistance(map: LevelMap, origin: { x: number; y: number }, angle: number, maxRange: number): number {
  return castRayAngle(map, origin, angle, maxRange).distance;
}

/** True if nothing solid stands between two points — used by enemy AI to
 * decide whether the player is visible, and reused by the hitscan test. */
export function hasLineOfSight(map: LevelMap, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < EPSILON) return true;
  const wallDist = castRay(map, from, dx / dist, dy / dist, dist).distance;
  return wallDist >= dist - 1e-6;
}

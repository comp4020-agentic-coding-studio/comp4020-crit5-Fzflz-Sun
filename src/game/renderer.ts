// Canvas 2D raycasting renderer — Wolfenstein-style: cast one ray per
// screen column for walls, then project enemies/pickups/projectiles/particles
// as 2D billboards through the same camera, respecting a per-column z-buffer
// so a wall in front of a sprite correctly hides it. No WebGL, no 3D geometry.
import type { AssetSlot } from "./assets";
import type { Enemy, GameState, Particle, Pickup, Projectile } from "./types";
import { castRay } from "./raycast";
import { quantizeAngle } from "./angle";
import { ASSET_MANIFEST, getSpriteImage } from "./assets";
import {
  BRUTE_SCALE,
  COLOR_FLOOR,
  COLOR_ICE,
  COLOR_INK,
  ENEMY_SCALE,
  EXIT_SCALE,
  FIRE_COOLDOWN,
  FOV_RADIANS,
  HORIZON_RATIO,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  MAX_RENDER_DIST,
  PICKUP_SCALE,
  PROJECTILE_SCALE,
  WALL_BRIGHTNESS_FLOOR,
  WEAPON_DRAW_HEIGHT,
  WEAPON_DRAW_WIDTH,
  WEAPON_FIRE_ANIM_DURATION,
} from "./constants";

const TAN_HALF_FOV = Math.tan(FOV_RADIANS / 2);
const HORIZON_Y = INTERNAL_HEIGHT * HORIZON_RATIO;

function slotForCell(cell: number): AssetSlot {
  return cell === 3 ? "door" : cell === 2 ? "wall.b" : "wall.a";
}

/** Casts one ray per column and draws the wall it hits by sampling a vertical
 * strip of that wall's texture (real per-column texture mapping, not a
 * checkerboard of flat blocks) then overlaying a translucent ink-tinted rect
 * for distance/side shading — brightness never drops below
 * WALL_BRIGHTNESS_FLOOR, so far walls stay legibly lit. */
function drawWalls(ctx: CanvasRenderingContext2D, state: GameState, dirX: number, dirY: number, planeX: number, planeY: number, zBuffer: Float64Array): void {
  const { player, map } = state;

  for (let x = 0; x < INTERNAL_WIDTH; x++) {
    const cameraX = (2 * x) / INTERNAL_WIDTH - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;
    const hit = castRay(map, player.pos, rayDirX, rayDirY, MAX_RENDER_DIST);
    zBuffer[x] = hit.distance;

    if (hit.cell === -1) continue;

    const lineHeight = hit.distance > 0.0001 ? Math.floor(INTERNAL_HEIGHT / hit.distance) : INTERNAL_HEIGHT;
    const drawStart = Math.max(0, Math.floor(HORIZON_Y - lineHeight / 2));
    const drawEnd = Math.min(INTERNAL_HEIGHT, Math.floor(HORIZON_Y + lineHeight / 2));
    if (drawEnd <= drawStart) continue;

    const slot = slotForCell(hit.cell);
    const texture = getSpriteImage(slot);

    if (texture) {
      const texX = Math.min(texture.width - 1, Math.max(0, Math.floor(hit.wallX * texture.width)));
      ctx.drawImage(texture, texX, 0, 1, texture.height, x, drawStart, 1, drawEnd - drawStart);
    } else {
      ctx.fillStyle = ASSET_MANIFEST[slot].placeholderColor;
      ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }

    const distanceFactor = Math.max(WALL_BRIGHTNESS_FLOOR, 1 - (hit.distance / MAX_RENDER_DIST) * (1 - WALL_BRIGHTNESS_FLOOR));
    const sideFactor = hit.side === 1 ? 0.88 : 1;
    const dimAlpha = Math.min(0.5, 1 - distanceFactor * sideFactor);
    if (dimAlpha > 0.01) {
      ctx.fillStyle = `rgba(38,54,76,${dimAlpha.toFixed(3)})`;
      ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }
  }
}

interface Billboard {
  x: number;
  y: number;
  slot: AssetSlot | null;
  frame: number;
  fallbackColor: string;
  scale: number;
  alpha: number;
  /** "floor" anchors the sprite's bottom edge to the ground plane at its own
   * depth (feet-on-floor, for characters with a real, non-square aspect
   * ratio); "center" keeps the old behavior of centering on the horizon
   * (pickups/projectiles/particles/the exit marker, which read fine either
   * way and aren't worth re-tuning). */
  anchor: "floor" | "center";
}

function collectBillboards(state: GameState): Billboard[] {
  const billboards: Billboard[] = [];
  const bobFrame = Math.floor(state.elapsed * 3) % 2;

  for (const enemy of state.enemies as Enemy[]) {
    if (!enemy.alive) continue;
    const hit = enemy.flashTimer > 0;
    const slot: AssetSlot = hit ? `enemy.${enemy.kind}.hit` : `enemy.${enemy.kind}.idle`;
    billboards.push({
      x: enemy.pos.x,
      y: enemy.pos.y,
      slot,
      frame: hit ? 0 : bobFrame,
      fallbackColor: ASSET_MANIFEST[`enemy.${enemy.kind}.idle`].placeholderColor,
      scale: enemy.kind === "brute" ? BRUTE_SCALE : ENEMY_SCALE,
      alpha: 1,
      anchor: "floor",
    });
  }

  for (const pickup of state.pickups as Pickup[]) {
    if (pickup.collected) continue;
    const slot: AssetSlot = pickup.kind === "ammo" ? "icon.ammo" : "icon.health";
    // Gentle blink so a pickup reads as interactive without any label.
    const blink = 0.7 + 0.3 * Math.sin(state.elapsed * 4 + pickup.id);
    billboards.push({ x: pickup.pos.x, y: pickup.pos.y, slot, frame: 0, fallbackColor: ASSET_MANIFEST[slot].placeholderColor, scale: PICKUP_SCALE, alpha: blink, anchor: "center" });
  }

  for (const projectile of state.projectiles as Projectile[]) {
    const pulseFrame = Math.floor(state.elapsed * 6) % 2;
    billboards.push({
      x: projectile.pos.x,
      y: projectile.pos.y,
      slot: "projectile",
      frame: pulseFrame,
      fallbackColor: ASSET_MANIFEST.projectile.placeholderColor,
      scale: PROJECTILE_SCALE,
      alpha: 1,
      anchor: "center",
    });
  }

  for (const particle of state.particles as Particle[]) {
    billboards.push({ x: particle.pos.x, y: particle.pos.y, slot: null, frame: 0, fallbackColor: particle.color, scale: 0.15, alpha: Math.max(0, particle.ttl / particle.maxTtl), anchor: "center" });
  }

  const exitUnlocked = state.enemies.every((e) => !e.alive);
  const pulse = exitUnlocked && Math.sin(state.elapsed * 6) > 0;
  billboards.push({
    x: state.map.exit.x + 0.5,
    y: state.map.exit.y + 0.5,
    slot: "icon.exit",
    frame: exitUnlocked ? 1 : 0,
    fallbackColor: exitUnlocked ? COLOR_ICE : COLOR_FLOOR,
    scale: EXIT_SCALE * (pulse ? 1.08 : 1),
    alpha: 1,
    anchor: "center",
  });

  return billboards;
}

/** Projects every billboard through the camera and draws it column-by-column
 * (per-column source-texture slicing, respecting the z-buffer), so a real
 * sprite silhouette occludes correctly against walls exactly like the old
 * flat-color blocks did. Billboards with no generated sprite yet (particles)
 * fall back to a flat fill. */
function drawBillboards(ctx: CanvasRenderingContext2D, state: GameState, dirX: number, dirY: number, planeX: number, planeY: number, zBuffer: Float64Array): void {
  const { player } = state;
  const billboards = collectBillboards(state);

  billboards.sort((a, b) => {
    const da = (a.x - player.pos.x) ** 2 + (a.y - player.pos.y) ** 2;
    const db = (b.x - player.pos.x) ** 2 + (b.y - player.pos.y) ** 2;
    return db - da;
  });

  const invDet = 1.0 / (planeX * dirY - dirX * planeY);

  for (const b of billboards) {
    const spriteX = b.x - player.pos.x;
    const spriteY = b.y - player.pos.y;

    const transformX = invDet * (dirY * spriteX - dirX * spriteY);
    const transformY = invDet * (-planeY * spriteX + planeX * spriteY); // depth

    if (transformY <= 0.05) continue;

    const image = b.slot ? getSpriteImage(b.slot, b.frame) : null;

    // Same reference height a wall at this exact depth would draw at
    // (INTERNAL_HEIGHT / transformY, unscaled) — used both to size the
    // sprite via its own scale factor and, for floor-anchored sprites, to
    // find the ground line at this depth independent of that scale.
    const wallLineHeight = INTERNAL_HEIGHT / transformY;
    const spriteHeight = Math.abs(Math.floor(wallLineHeight * b.scale));
    if (spriteHeight <= 0) continue;

    // Width follows the source image's real aspect ratio instead of being
    // forced equal to height — previously every billboard was square
    // regardless of its art, which is why non-square real sprites (people,
    // robots) looked stretched/cropped.
    const aspect = image ? image.width / image.height : 1;
    const spriteWidth = Math.max(1, Math.floor(spriteHeight * aspect));

    const spriteScreenX = Math.floor((INTERNAL_WIDTH / 2) * (1 + transformX / transformY));
    const drawStartX = Math.max(0, -Math.floor(spriteWidth / 2) + spriteScreenX);
    const drawEndX = Math.min(INTERNAL_WIDTH, Math.floor(spriteWidth / 2) + spriteScreenX);
    const spriteLeft = spriteScreenX - spriteWidth / 2;

    let drawStartY: number;
    let drawEndY: number;
    if (b.anchor === "floor") {
      // The floor line a wall at this depth would show, i.e. feet planted on
      // the ground plane rather than the sprite centered on the horizon.
      const floorY = HORIZON_Y + wallLineHeight / 2;
      drawEndY = Math.min(INTERNAL_HEIGHT, Math.floor(floorY));
      drawStartY = Math.max(0, Math.floor(floorY - spriteHeight));
    } else {
      drawStartY = Math.max(0, -Math.floor(spriteHeight / 2) + HORIZON_Y);
      drawEndY = Math.min(INTERNAL_HEIGHT, Math.floor(spriteHeight / 2) + HORIZON_Y);
    }

    ctx.globalAlpha = b.alpha;

    if (image) {
      const srcW = image.width;
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (transformY >= zBuffer[stripe]) continue;
        const texX = Math.min(srcW - 1, Math.max(0, Math.floor(((stripe - spriteLeft) / spriteWidth) * srcW)));
        ctx.drawImage(image, texX, 0, 1, image.height, stripe, drawStartY, 1, drawEndY - drawStartY);
      }
    } else {
      ctx.fillStyle = b.fallbackColor;
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (transformY >= zBuffer[stripe]) continue;
        ctx.fillRect(stripe, drawStartY, 1, drawEndY - drawStartY);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, state: GameState): void {
  // FIRE_COOLDOWN counts player.fireCooldown down to 0 after each shot, so
  // this is seconds elapsed since the shot that's still cooling down. The
  // four real fire frames (already including the hand and muzzle flash) play
  // across the first WEAPON_FIRE_ANIM_DURATION of that window, then it's back
  // to idle for the remainder of the cooldown.
  const elapsedSinceFire = FIRE_COOLDOWN - state.player.fireCooldown;
  const firing = elapsedSinceFire >= 0 && elapsedSinceFire < WEAPON_FIRE_ANIM_DURATION;
  const frame = firing ? Math.min(3, Math.floor((elapsedSinceFire / WEAPON_FIRE_ANIM_DURATION) * 4)) : 0;
  const slot: AssetSlot = firing ? "weapon.fire" : "weapon.idle";

  const image = getSpriteImage(slot, frame);
  const w = WEAPON_DRAW_WIDTH;
  const h = WEAPON_DRAW_HEIGHT;
  const x = INTERNAL_WIDTH / 2 - w / 2;
  const y = INTERNAL_HEIGHT - h;

  if (image) {
    ctx.drawImage(image, x, y, w, h);
  } else {
    ctx.fillStyle = ASSET_MANIFEST[slot].placeholderColor;
    ctx.fillRect(x, y, w, h);
  }
}

const FLOOR_DITHER = 8;

function drawCeilingAndFloor(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLOR_ICE;
  ctx.fillRect(0, 0, INTERNAL_WIDTH, HORIZON_Y);
  ctx.fillStyle = COLOR_FLOOR;
  ctx.fillRect(0, HORIZON_Y, INTERNAL_WIDTH, INTERNAL_HEIGHT - HORIZON_Y);

  // A faint, regular dither on the floor only — enough texture to read as a
  // tile floor rather than a flat fill, without any dynamic lighting.
  ctx.fillStyle = COLOR_INK;
  ctx.globalAlpha = 0.06;
  const startRow = Math.ceil(HORIZON_Y / FLOOR_DITHER);
  for (let fy = startRow * FLOOR_DITHER; fy < INTERNAL_HEIGHT; fy += FLOOR_DITHER) {
    const rowIndex = Math.round((fy - startRow * FLOOR_DITHER) / FLOOR_DITHER);
    for (let fx = rowIndex % 2 === 0 ? 0 : FLOOR_DITHER; fx < INTERNAL_WIDTH; fx += FLOOR_DITHER * 2) {
      ctx.fillRect(fx, fy, FLOOR_DITHER, FLOOR_DITHER);
    }
  }
  ctx.globalAlpha = 1;
}

/** Draws one frame. The camera direction is the quantized render angle, not
 * the player's raw continuous angle — the same quantized value combat uses
 * to fire, so aim always matches what's on screen despite there being no
 * crosshair. */
export function renderFrame(ctx: CanvasRenderingContext2D, state: GameState): void {
  const renderAngle = quantizeAngle(state.player.angle);
  const dirX = Math.cos(renderAngle);
  const dirY = Math.sin(renderAngle);
  const planeX = -dirY * TAN_HALF_FOV;
  const planeY = dirX * TAN_HALF_FOV;

  drawCeilingAndFloor(ctx);

  const zBuffer = new Float64Array(INTERNAL_WIDTH);
  drawWalls(ctx, state, dirX, dirY, planeX, planeY, zBuffer);
  drawBillboards(ctx, state, dirX, dirY, planeX, planeY, zBuffer);
  drawWeapon(ctx, state);
}

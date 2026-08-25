// Canvas 2D raycasting renderer — Wolfenstein-style: cast one ray per
// screen column for walls, then project enemies/pickups/particles as 2D
// billboards through the same camera, respecting a per-column z-buffer so a
// wall in front of a sprite correctly hides it. No WebGL, no 3D geometry.
import type { Enemy, GameState, Particle, Pickup } from "./types";
import { castRay } from "./raycast";
import { quantizeAngle } from "./angle";
import { ASSET_MANIFEST, getSpriteImage } from "./assets";
import { FOV_RADIANS, INTERNAL_HEIGHT, INTERNAL_WIDTH, MAX_RENDER_DIST } from "./constants";

const TAN_HALF_FOV = Math.tan(FOV_RADIANS / 2);
const TEX_BLOCKS = 8;

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `rgb(${r},${g},${b})`;
}

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
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + INTERNAL_HEIGHT / 2));
    const drawEnd = Math.min(INTERNAL_HEIGHT, Math.floor(lineHeight / 2 + INTERNAL_HEIGHT / 2));

    const baseColor = hit.cell === 3 ? ASSET_MANIFEST.door.placeholderColor : hit.cell === 2 ? ASSET_MANIFEST["wall.b"].placeholderColor : ASSET_MANIFEST["wall.a"].placeholderColor;

    const distanceFactor = Math.max(0.35, 1 - hit.distance / MAX_RENDER_DIST);
    const sideFactor = hit.side === 1 ? 0.78 : 1;
    const texBlockX = Math.floor(hit.wallX * TEX_BLOCKS);

    // Draw the column in coarse vertical blocks so the flat placeholder
    // color reads as a rough checkerboard texture rather than a flat fill.
    const blockPx = Math.max(2, Math.round(INTERNAL_HEIGHT / 25));
    for (let y = drawStart; y < drawEnd; y += blockPx) {
      const blockIndex = Math.floor((y - drawStart) / blockPx);
      const checker = (texBlockX + blockIndex) % 2 === 0 ? 1 : 0.85;
      ctx.fillStyle = shade(baseColor, distanceFactor * sideFactor * checker);
      ctx.fillRect(x, y, 1, Math.min(blockPx, drawEnd - y));
    }
  }
}

interface Billboard {
  x: number;
  y: number;
  color: string;
  scale: number;
  alpha: number;
}

function collectBillboards(state: GameState): Billboard[] {
  const billboards: Billboard[] = [];

  for (const enemy of state.enemies as Enemy[]) {
    if (!enemy.alive) continue;
    const base = ASSET_MANIFEST[`enemy.${enemy.kind}.idle`].placeholderColor;
    billboards.push({
      x: enemy.pos.x,
      y: enemy.pos.y,
      color: enemy.flashTimer > 0 ? "#ffffff" : base,
      scale: enemy.kind === "brute" ? 1.25 : 1,
      alpha: 1,
    });
  }

  for (const pickup of state.pickups as Pickup[]) {
    if (pickup.collected) continue;
    const slot = pickup.kind === "ammo" ? "icon.ammo" : "icon.health";
    // Gentle bob/blink so a pickup reads as interactive without any label.
    const blink = 0.7 + 0.3 * Math.sin(state.elapsed * 4 + pickup.id);
    billboards.push({ x: pickup.pos.x, y: pickup.pos.y, color: ASSET_MANIFEST[slot].placeholderColor, scale: 0.45, alpha: blink });
  }

  for (const particle of state.particles as Particle[]) {
    billboards.push({ x: particle.pos.x, y: particle.pos.y, color: particle.color, scale: 0.15, alpha: Math.max(0, particle.ttl / particle.maxTtl) });
  }

  const exitUnlocked = state.enemies.every((e) => !e.alive);
  const exitColor = exitUnlocked ? (Math.sin(state.elapsed * 8) > 0 ? "#f4fff0" : ASSET_MANIFEST["icon.exit"].placeholderColor) : "#4a5a52";
  billboards.push({ x: state.map.exit.x + 0.5, y: state.map.exit.y + 0.5, color: exitColor, scale: 1.4, alpha: 1 });

  return billboards;
}

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

    const spriteScreenX = Math.floor((INTERNAL_WIDTH / 2) * (1 + transformX / transformY));
    const spriteSize = Math.abs(Math.floor((INTERNAL_HEIGHT / transformY) * b.scale));
    if (spriteSize <= 0) continue;

    const drawStartX = Math.max(0, -Math.floor(spriteSize / 2) + spriteScreenX);
    const drawEndX = Math.min(INTERNAL_WIDTH, Math.floor(spriteSize / 2) + spriteScreenX);
    const drawStartY = Math.max(0, -Math.floor(spriteSize / 2) + INTERNAL_HEIGHT / 2);
    const drawEndY = Math.min(INTERNAL_HEIGHT, Math.floor(spriteSize / 2) + INTERNAL_HEIGHT / 2);

    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = b.color;
    for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
      if (transformY >= zBuffer[stripe]) continue;
      ctx.fillRect(stripe, drawStartY, 1, drawEndY - drawStartY);
    }
    ctx.globalAlpha = 1;
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, state: GameState): void {
  const justFired = state.player.fireCooldown > 0.18;
  const image = getSpriteImage(justFired ? "weapon.fire" : "weapon.idle");
  const w = 64;
  const h = 56;
  const x = INTERNAL_WIDTH / 2 - w / 2;
  const y = INTERNAL_HEIGHT - h + (justFired ? 4 : 8); // slight kick on fire

  if (image) {
    ctx.drawImage(image, x, y, w, h);
    return;
  }

  const color = justFired ? ASSET_MANIFEST["weapon.fire"].placeholderColor : ASSET_MANIFEST["weapon.idle"].placeholderColor;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 0.7);
  ctx.fillRect(x + w / 2 - 6, y - 14, 12, 18); // barrel
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

  ctx.fillStyle = "#dbe6f5";
  ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT / 2);
  ctx.fillStyle = "#aab4bd";
  ctx.fillRect(0, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT / 2);

  const zBuffer = new Float64Array(INTERNAL_WIDTH);
  drawWalls(ctx, state, dirX, dirY, planeX, planeY, zBuffer);
  drawBillboards(ctx, state, dirX, dirY, planeX, planeY, zBuffer);
  drawWeapon(ctx, state);
}

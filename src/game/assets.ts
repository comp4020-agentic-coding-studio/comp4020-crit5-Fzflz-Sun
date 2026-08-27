// Central manifest of every art slot the game needs, plus a procedural pixel
// sprite factory that renders each one to an offscreen canvas the first time
// it's asked for. No PNGs are downloaded or shipped — every sprite here is
// drawn from flat color blocks at runtime. The renderer only ever asks this
// module for a slot, never draws a hardcoded shape itself, so dropping in
// real PNGs later is a manifest + generator edit, not a rendering-code edit.
import { COLOR_CREAM, COLOR_CYAN, COLOR_FLOOR, COLOR_ICE, COLOR_INK, COLOR_LAVENDER, COLOR_PEACH, COLOR_PINK } from "./constants";
import type { EnemyKind } from "./types";

export type AssetSlot =
  | "wall.a"
  | "wall.b"
  | "door"
  | "enemy.grunt.idle"
  | "enemy.grunt.hit"
  | "enemy.grunt.death"
  | "enemy.scout.idle"
  | "enemy.scout.hit"
  | "enemy.scout.death"
  | "enemy.brute.idle"
  | "enemy.brute.hit"
  | "enemy.brute.death"
  | "weapon.idle"
  | "weapon.fire"
  | "projectile"
  | "icon.ammo"
  | "icon.health"
  | "icon.exit"
  | "hud.health"
  | "hud.ammo"
  | "hud.enemies";

export interface AssetManifestEntry {
  /** Suggested source pixel size once real art replaces the procedural one. */
  suggestedSize: [number, number];
  /** Base color the procedural generator builds this slot from, and the flat
   * fallback used if generation isn't available (e.g. no DOM). */
  placeholderColor: string;
  /** Where an eventual PNG replacement would live, relative to /public. */
  path: string;
}

export const ASSET_MANIFEST: Record<AssetSlot, AssetManifestEntry> = {
  "wall.a": { suggestedSize: [64, 64], placeholderColor: COLOR_ICE, path: "sprites/wall-a.png" },
  "wall.b": { suggestedSize: [64, 64], placeholderColor: COLOR_LAVENDER, path: "sprites/wall-b.png" },
  door: { suggestedSize: [64, 64], placeholderColor: COLOR_PEACH, path: "sprites/door.png" },
  "enemy.grunt.idle": { suggestedSize: [48, 64], placeholderColor: COLOR_CYAN, path: "sprites/grunt-idle.png" },
  "enemy.grunt.hit": { suggestedSize: [48, 64], placeholderColor: COLOR_LAVENDER, path: "sprites/grunt-hit.png" },
  "enemy.grunt.death": { suggestedSize: [48, 64], placeholderColor: COLOR_FLOOR, path: "sprites/grunt-death.png" },
  "enemy.scout.idle": { suggestedSize: [48, 64], placeholderColor: COLOR_PINK, path: "sprites/scout-idle.png" },
  "enemy.scout.hit": { suggestedSize: [48, 64], placeholderColor: COLOR_LAVENDER, path: "sprites/scout-hit.png" },
  "enemy.scout.death": { suggestedSize: [48, 64], placeholderColor: COLOR_FLOOR, path: "sprites/scout-death.png" },
  "enemy.brute.idle": { suggestedSize: [64, 80], placeholderColor: COLOR_PEACH, path: "sprites/brute-idle.png" },
  "enemy.brute.hit": { suggestedSize: [64, 80], placeholderColor: COLOR_LAVENDER, path: "sprites/brute-hit.png" },
  "enemy.brute.death": { suggestedSize: [64, 80], placeholderColor: COLOR_FLOOR, path: "sprites/brute-death.png" },
  "weapon.idle": { suggestedSize: [128, 128], placeholderColor: "#cfd8e3", path: "sprites/weapon-idle.png" },
  "weapon.fire": { suggestedSize: [128, 128], placeholderColor: COLOR_CREAM, path: "sprites/weapon-fire.png" },
  projectile: { suggestedSize: [16, 16], placeholderColor: COLOR_LAVENDER, path: "sprites/projectile.png" },
  "icon.ammo": { suggestedSize: [32, 32], placeholderColor: COLOR_CREAM, path: "sprites/icon-ammo.png" },
  "icon.health": { suggestedSize: [32, 32], placeholderColor: COLOR_PINK, path: "sprites/icon-health.png" },
  "icon.exit": { suggestedSize: [64, 64], placeholderColor: COLOR_CYAN, path: "sprites/icon-exit.png" },
  "hud.health": { suggestedSize: [24, 24], placeholderColor: COLOR_PINK, path: "sprites/hud-health.png" },
  "hud.ammo": { suggestedSize: [24, 24], placeholderColor: COLOR_CREAM, path: "sprites/hud-ammo.png" },
  "hud.enemies": { suggestedSize: [24, 24], placeholderColor: COLOR_CYAN, path: "sprites/hud-enemies.png" },
};

// ---------------------------------------------------------------------------
// Drawing primitives. Every sprite below is composed from these two shapes —
// no hand-placed pixel grids, so the results are simple to reason about
// without a visual editor: a chunky, outlined blob or box every time.
// ---------------------------------------------------------------------------

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** A blocky pixel-art ellipse: `unit`-sized cells filled solid inside, an
 * outline ring of cells on the boundary, nothing outside. The one shape
 * every character/pickup/projectile in this game is built from. */
function blockyEllipse(
  ctx: CanvasRenderingContext2D,
  unit: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  outline: string,
): void {
  const minGx = Math.floor(cx - rx) - 1;
  const maxGx = Math.ceil(cx + rx) + 1;
  const minGy = Math.floor(cy - ry) - 1;
  const maxGy = Math.ceil(cy + ry) + 1;
  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      const nx = (gx + 0.5 - cx) / rx;
      const ny = (gy + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1.12) continue;
      ctx.fillStyle = d > 0.72 ? outline : fill;
      ctx.fillRect(gx * unit, gy * unit, unit, unit);
    }
  }
}

/** A blocky outlined rectangle, in the same `unit`-cell grid coordinates. */
function blockyRect(
  ctx: CanvasRenderingContext2D,
  unit: number,
  gx0: number,
  gy0: number,
  gw: number,
  gh: number,
  fill: string,
  outline: string,
): void {
  for (let gy = gy0; gy < gy0 + gh; gy++) {
    for (let gx = gx0; gx < gx0 + gw; gx++) {
      const edge = gy === gy0 || gy === gy0 + gh - 1 || gx === gx0 || gx === gx0 + gw - 1;
      ctx.fillStyle = edge ? outline : fill;
      ctx.fillRect(gx * unit, gy * unit, unit, unit);
    }
  }
}

// ---------------------------------------------------------------------------
// Wall / door textures — 64x64, tileable, thick outline, a school-supplies
// theme instead of a generic checkerboard.
// ---------------------------------------------------------------------------

function genLockerTexture(): HTMLCanvasElement {
  const size = 64;
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = ASSET_MANIFEST["wall.a"].placeholderColor;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  ctx.fillStyle = COLOR_PEACH;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillRect(col * 16 + 12, row * 32 + 14, 4, 8);
    }
  }
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  return canvas;
}

function genPegboardTexture(): HTMLCanvasElement {
  const size = 64;
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = ASSET_MANIFEST["wall.b"].placeholderColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = COLOR_CYAN;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * 16 + 8;
      const cy = row * 16 + 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  return canvas;
}

function genDoorTexture(): HTMLCanvasElement {
  const size = 64;
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = ASSET_MANIFEST.door.placeholderColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = COLOR_CYAN;
  ctx.fillRect(16, 10, 32, 18);
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 10, 32, 18);
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(30, 42, 4, 10);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  return canvas;
}

// ---------------------------------------------------------------------------
// Enemies — original school characters, not the wall/floor texture theme.
// Each kind gets two idle-bob frames and one hit frame (outline swapped to
// light lavender, matching the light-purple hit-feedback border on the HUD
// side). Death has no lingering sprite: the cream/wreckage particle burst in
// combat.ts carries that beat instead.
// ---------------------------------------------------------------------------

interface EnemySpriteSet {
  idle: HTMLCanvasElement[];
  hit: HTMLCanvasElement;
}

function genGruntSprites(): EnemySpriteSet {
  const unit = 4;
  const w = 48 / unit;
  const h = 64 / unit;
  const body = ASSET_MANIFEST["enemy.grunt.idle"].placeholderColor;

  function draw(outline: string, bob: number): HTMLCanvasElement {
    const canvas = makeCanvas(w * unit, h * unit);
    const ctx = ctx2d(canvas);
    blockyRect(ctx, unit, 2, 12, 8, 3, COLOR_FLOOR, COLOR_INK);
    blockyEllipse(ctx, unit, 6, 8 - bob, 4, 4.5, body, outline);
    blockyEllipse(ctx, unit, 6, 7 - bob, 1.3, 1.3, COLOR_LAVENDER, outline);
    return canvas;
  }

  return { idle: [draw(COLOR_INK, 0), draw(COLOR_INK, 0.4)], hit: draw(COLOR_LAVENDER, 0) };
}

function genScoutSprites(): EnemySpriteSet {
  const unit = 4;
  const w = 48 / unit;
  const h = 64 / unit;
  const body = ASSET_MANIFEST["enemy.scout.idle"].placeholderColor;

  function draw(outline: string, squash: number): HTMLCanvasElement {
    const canvas = makeCanvas(w * unit, h * unit);
    const ctx = ctx2d(canvas);
    blockyRect(ctx, unit, 5, 13, 2, 2, COLOR_INK, COLOR_INK);
    blockyEllipse(ctx, unit, 6, 7, 5, 5.5 - squash, body, outline);
    blockyEllipse(ctx, unit, 4.3, 6, 1, 1.2, COLOR_CREAM, outline);
    blockyEllipse(ctx, unit, 7.7, 6, 1, 1.2, COLOR_CREAM, outline);
    ctx.fillStyle = outline;
    ctx.fillRect(4 * unit, 9 * unit, 4 * unit, unit);
    return canvas;
  }

  return { idle: [draw(COLOR_INK, 0), draw(COLOR_INK, 0.6)], hit: draw(COLOR_LAVENDER, 0) };
}

function genBruteSprites(): EnemySpriteSet {
  const unit = 4;
  const w = 64 / unit;
  const h = 80 / unit;
  const body = ASSET_MANIFEST["enemy.brute.idle"].placeholderColor;

  function draw(outline: string, litUp: boolean): HTMLCanvasElement {
    const canvas = makeCanvas(w * unit, h * unit);
    const ctx = ctx2d(canvas);
    blockyRect(ctx, unit, 2, 17, 12, 2, COLOR_FLOOR, COLOR_INK);
    blockyRect(ctx, unit, 3, 4, 10, 13, body, outline);
    if (litUp) blockyRect(ctx, unit, 5, 6, 6, 2, COLOR_CREAM, outline);
    ctx.fillStyle = outline;
    ctx.fillRect(7 * unit, 9 * unit, 2 * unit, unit);
    return canvas;
  }

  return { idle: [draw(COLOR_INK, true), draw(COLOR_INK, false)], hit: draw(COLOR_LAVENDER, true) };
}

// ---------------------------------------------------------------------------
// Weapon — a small silver-gray semicircular "cream disc launcher". Fire frame
// shows the housing recoiling down with the disc already gone.
// ---------------------------------------------------------------------------

function genWeaponSprite(firing: boolean): HTMLCanvasElement {
  const unit = 8;
  const canvas = makeCanvas(16 * unit, 16 * unit);
  const ctx = ctx2d(canvas);
  const housing = ASSET_MANIFEST["weapon.idle"].placeholderColor;
  const recoil = firing ? 1 : 0;
  blockyRect(ctx, unit, 3, 9 + recoil, 10, 6, housing, COLOR_INK);
  if (!firing) {
    blockyEllipse(ctx, unit, 8, 6, 3.2, 1.8, COLOR_CREAM, COLOR_INK);
  } else {
    ctx.globalAlpha = 0.5;
    blockyEllipse(ctx, unit, 8, 2.5, 2.4, 1.4, COLOR_CREAM, COLOR_CREAM);
    ctx.globalAlpha = 1;
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Projectile — a soft violet-blue disc, pulsing gently across two frames.
// ---------------------------------------------------------------------------

function genProjectileFrame(pulse: number): HTMLCanvasElement {
  const size = 16;
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  const unit = 1;
  blockyEllipse(ctx, unit, 8, 8, 6 + pulse, 6 + pulse, COLOR_LAVENDER, COLOR_CYAN);
  blockyEllipse(ctx, unit, 8, 8, 2.4, 2.4, COLOR_ICE, COLOR_ICE);
  return canvas;
}

// ---------------------------------------------------------------------------
// Pickups — a cream disc box (ammo) and a repair patch (health).
// ---------------------------------------------------------------------------

function genAmmoIcon(): HTMLCanvasElement {
  const unit = 2;
  const canvas = makeCanvas(32, 32);
  const ctx = ctx2d(canvas);
  blockyRect(ctx, unit, 2, 4, 12, 9, ASSET_MANIFEST["icon.ammo"].placeholderColor, COLOR_INK);
  ctx.fillStyle = COLOR_PEACH;
  ctx.fillRect(2 * unit, 8 * unit, 12 * unit, unit);
  return canvas;
}

function genHealthIcon(): HTMLCanvasElement {
  const unit = 2;
  const canvas = makeCanvas(32, 32);
  const ctx = ctx2d(canvas);
  blockyEllipse(ctx, unit, 8, 8, 6, 6, ASSET_MANIFEST["icon.health"].placeholderColor, COLOR_INK);
  ctx.fillStyle = COLOR_CREAM;
  ctx.fillRect(6 * unit, 3 * unit, 4 * unit, 10 * unit);
  ctx.fillRect(3 * unit, 6 * unit, 10 * unit, 4 * unit);
  return canvas;
}

// ---------------------------------------------------------------------------
// Exit marker — locked (dim) vs unlocked (bright), an obvious color swap that
// doubles as the win condition's only "explanation".
// ---------------------------------------------------------------------------

function genExitIcon(unlocked: boolean): HTMLCanvasElement {
  const unit = 4;
  const canvas = makeCanvas(64, 64);
  const ctx = ctx2d(canvas);
  const frame = unlocked ? COLOR_CYAN : COLOR_FLOOR;
  const glow = unlocked ? COLOR_CREAM : COLOR_FLOOR;
  blockyRect(ctx, unit, 3, 2, 10, 13, frame, COLOR_INK);
  blockyRect(ctx, unit, 6, 5, 4, 7, glow, COLOR_INK);
  return canvas;
}

// ---------------------------------------------------------------------------
// Cache + lookup. Every sprite is a pure function of its slot (no randomness,
// no external state), so generation happens once, lazily, on first request.
// ---------------------------------------------------------------------------

const frameCache = new Map<AssetSlot, HTMLCanvasElement[]>();
let enemySprites: Record<EnemyKind, EnemySpriteSet> | null = null;

function getEnemySprites(): Record<EnemyKind, EnemySpriteSet> {
  if (!enemySprites) {
    enemySprites = { grunt: genGruntSprites(), scout: genScoutSprites(), brute: genBruteSprites() };
  }
  return enemySprites;
}

function generateFrames(slot: AssetSlot): HTMLCanvasElement[] | null {
  switch (slot) {
    case "wall.a":
      return [genLockerTexture()];
    case "wall.b":
      return [genPegboardTexture()];
    case "door":
      return [genDoorTexture()];
    case "enemy.grunt.idle":
      return getEnemySprites().grunt.idle;
    case "enemy.grunt.hit":
      return [getEnemySprites().grunt.hit];
    case "enemy.scout.idle":
      return getEnemySprites().scout.idle;
    case "enemy.scout.hit":
      return [getEnemySprites().scout.hit];
    case "enemy.brute.idle":
      return getEnemySprites().brute.idle;
    case "enemy.brute.hit":
      return [getEnemySprites().brute.hit];
    case "weapon.idle":
      return [genWeaponSprite(false)];
    case "weapon.fire":
      return [genWeaponSprite(true)];
    case "projectile":
      return [genProjectileFrame(0), genProjectileFrame(0.6)];
    case "icon.ammo":
      return [genAmmoIcon()];
    case "icon.health":
      return [genHealthIcon()];
    case "icon.exit":
      return [genExitIcon(false), genExitIcon(true)];
    // Death frames and HUD icons aren't wired up yet — see PROCESS.md's
    // "left as placeholder" notes. getSpriteImage falls back to a flat color
    // for these, same contract as before any generator existed.
    default:
      return null;
  }
}

/** Returns a generated sprite frame for a slot, or null if that slot has no
 * generator yet (callers fall back to ASSET_MANIFEST's placeholder color) or
 * no DOM is available (e.g. a non-browser test environment). `frame` selects
 * an animation frame by index, wrapping if the slot has fewer frames. */
export function getSpriteImage(slot: AssetSlot, frame = 0): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;

  let frames = frameCache.get(slot);
  if (!frames) {
    const generated = generateFrames(slot);
    if (!generated) return null;
    frames = generated;
    frameCache.set(slot, frames);
  }

  return frames[frame % frames.length] ?? frames[0] ?? null;
}

// Central manifest of every art slot the game needs, plus a procedural pixel
// sprite factory that renders each one to an offscreen canvas the first time
// it's asked for. Most slots still draw from flat color blocks at runtime; a
// small curated set loads a real PNG instead (see the "Real-image preloading"
// section below and THIRD_PARTY_ASSETS.md), always falling back to the
// procedural drawing if that file isn't loaded yet. The renderer only ever
// asks this module for a slot, never draws a hardcoded shape itself, so
// swapping a slot's source is a manifest edit, not a rendering-code edit.
import { COLOR_CREAM, COLOR_CYAN, COLOR_FLOOR, COLOR_ICE, COLOR_INK, COLOR_LAVENDER, COLOR_PEACH, COLOR_PINK } from "./constants";
import type { EnemyKind, UpgradeKind } from "./types";

export type AssetSlot =
  | "wall.a"
  | "wall.b"
  | "door"
  | "barrier"
  | "pedestal.rapid"
  | "pedestal.impact"
  | "pedestal.pierce"
  | "pedestal.salvage"
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
  barrier: { suggestedSize: [64, 64], placeholderColor: COLOR_CYAN, path: "sprites/barrier.png" },
  "pedestal.rapid": { suggestedSize: [32, 48], placeholderColor: COLOR_CYAN, path: "sprites/pedestal-rapid.png" },
  "pedestal.impact": { suggestedSize: [32, 48], placeholderColor: COLOR_PEACH, path: "sprites/pedestal-impact.png" },
  "pedestal.pierce": { suggestedSize: [32, 48], placeholderColor: COLOR_LAVENDER, path: "sprites/pedestal-pierce.png" },
  "pedestal.salvage": { suggestedSize: [32, 48], placeholderColor: COLOR_CREAM, path: "sprites/pedestal-salvage.png" },
  "enemy.grunt.idle": { suggestedSize: [48, 64], placeholderColor: COLOR_CYAN, path: "sprites/grunt-idle.png" },
  "enemy.grunt.hit": { suggestedSize: [48, 64], placeholderColor: COLOR_LAVENDER, path: "sprites/grunt-hit.png" },
  "enemy.grunt.death": { suggestedSize: [48, 64], placeholderColor: COLOR_FLOOR, path: "sprites/grunt-death.png" },
  "enemy.scout.idle": { suggestedSize: [48, 64], placeholderColor: COLOR_PINK, path: "sprites/scout-idle.png" },
  "enemy.scout.hit": { suggestedSize: [48, 64], placeholderColor: COLOR_LAVENDER, path: "sprites/scout-hit.png" },
  "enemy.scout.death": { suggestedSize: [48, 64], placeholderColor: COLOR_FLOOR, path: "sprites/scout-death.png" },
  "enemy.brute.idle": { suggestedSize: [64, 80], placeholderColor: COLOR_PEACH, path: "sprites/brute-idle.png" },
  "enemy.brute.hit": { suggestedSize: [64, 80], placeholderColor: COLOR_LAVENDER, path: "sprites/brute-hit.png" },
  "enemy.brute.death": { suggestedSize: [64, 80], placeholderColor: COLOR_FLOOR, path: "sprites/brute-death.png" },
  "weapon.idle": { suggestedSize: [64, 64], placeholderColor: "#cfd8e3", path: "sprites/weapon-idle.png" },
  "weapon.fire": { suggestedSize: [64, 64], placeholderColor: COLOR_CREAM, path: "sprites/weapon-fire-0.png" },
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
// Barrier gate — a pulsing energy fence sealing Room B's exit shut during its
// encounter. Two frames (dim / bright cross-hatch) the renderer alternates
// between so it visibly hums rather than sitting as a flat colored wall.
// ---------------------------------------------------------------------------

function genBarrierFrame(bright: boolean): HTMLCanvasElement {
  const size = 64;
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = bright ? 0.85 : 0.55;
  ctx.fillStyle = COLOR_CYAN;
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 4);
  }
  ctx.globalAlpha = bright ? 0.9 : 0.5;
  ctx.strokeStyle = COLOR_ICE;
  ctx.lineWidth = bright ? 3 : 1.5;
  for (let x = 8; x < size; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  return canvas;
}

// ---------------------------------------------------------------------------
// Upgrade pedestals — a floor-anchored base with a color-coded floating orb,
// one color per upgrade so the two choices in a pair read as distinct from
// across the room, no label needed until the player is close (see the HUD
// hint banner for the text).
// ---------------------------------------------------------------------------

const PEDESTAL_ORB_COLOR: Record<UpgradeKind, string> = {
  rapid: COLOR_CYAN,
  impact: COLOR_PEACH,
  pierce: COLOR_LAVENDER,
  salvage: COLOR_CREAM,
};

function genPedestalSprite(kind: UpgradeKind): HTMLCanvasElement {
  const unit = 2;
  const canvas = makeCanvas(32, 48);
  const ctx = ctx2d(canvas);
  blockyRect(ctx, unit, 5, 18, 6, 5, COLOR_FLOOR, COLOR_INK);
  blockyRect(ctx, unit, 6, 14, 4, 4, COLOR_ICE, COLOR_INK);
  blockyEllipse(ctx, unit, 8, 8, 4.5, 4.5, PEDESTAL_ORB_COLOR[kind], COLOR_INK);
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
    case "barrier":
      return [genBarrierFrame(false), genBarrierFrame(true)];
    case "pedestal.rapid":
      return [genPedestalSprite("rapid")];
    case "pedestal.impact":
      return [genPedestalSprite("impact")];
    case "pedestal.pierce":
      return [genPedestalSprite("pierce")];
    case "pedestal.salvage":
      return [genPedestalSprite("salvage")];
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

// ---------------------------------------------------------------------------
// Real-image preloading. A small, curated subset of slots (the two wall
// textures, the door, three enemy kinds' idle/hit frames, and the weapon's
// idle/fire frames) can load an actual PNG from /public/sprites instead of
// the procedural drawing above. Everything else — icons — stays procedural;
// this is an opt-in list, not a blanket replacement. Loading is async and
// best-effort: a slot with no successfully-loaded image just keeps using its
// procedural generator, so a slow network or a missing file never blocks or
// breaks the game.
// ---------------------------------------------------------------------------

// Idle sets have two real frames (a hand-authored "bob"); hit sets have one.
// weapon.fire has four real frames (the muzzle-flash animation). Any slot not
// listed here falls back to its single ASSET_MANIFEST path.
const REAL_SPRITE_FRAMES: Partial<Record<AssetSlot, string[]>> = {
  "enemy.grunt.idle": ["sprites/enemy-grunt-idle-0.png", "sprites/enemy-grunt-idle-1.png"],
  "enemy.grunt.hit": ["sprites/enemy-grunt-hit.png"],
  "enemy.scout.idle": ["sprites/enemy-scout-idle-0.png", "sprites/enemy-scout-idle-1.png"],
  "enemy.scout.hit": ["sprites/enemy-scout-hit.png"],
  "enemy.brute.idle": ["sprites/enemy-brute-idle-0.png", "sprites/enemy-brute-idle-1.png"],
  "enemy.brute.hit": ["sprites/enemy-brute-hit.png"],
  "weapon.fire": [
    "sprites/weapon-fire-0.png",
    "sprites/weapon-fire-1.png",
    "sprites/weapon-fire-2.png",
    "sprites/weapon-fire-3.png",
  ],
};

// Only these slots are ever fetched as real PNGs — everything else (icons)
// has no shipped file and stays procedural.
const REAL_ASSET_SLOTS: AssetSlot[] = [
  "wall.a",
  "wall.b",
  "door",
  "enemy.grunt.idle",
  "enemy.grunt.hit",
  "enemy.scout.idle",
  "enemy.scout.hit",
  "enemy.brute.idle",
  "enemy.brute.hit",
  "weapon.idle",
  "weapon.fire",
];

// Slots with no multi-frame entry in REAL_SPRITE_FRAMES fall back to a
// single-element array wrapping their one manifest path. That fallback array
// is memoized per slot (built once, reused forever) rather than allocated
// fresh on every call — getSpriteImage calls this from the ~320-column wall
// loop every single frame, so an unmemoized version meant hundreds of
// throwaway one-element arrays created and GC'd per frame for every wall/door
// slot that has no real art.
const fallbackImagePaths = new Map<AssetSlot, string[]>();

function realImagePaths(slot: AssetSlot): string[] {
  const real = REAL_SPRITE_FRAMES[slot];
  if (real) return real;

  let fallback = fallbackImagePaths.get(slot);
  if (!fallback) {
    fallback = [ASSET_MANIFEST[slot].path];
    fallbackImagePaths.set(slot, fallback);
  }
  return fallback;
}

const realImages = new Map<string, HTMLImageElement>();

// Resolved against document.baseURI (not a root-relative "/sprites/…") so the
// same build works whether it's served at a domain root or a GitHub Pages
// subpath like username.github.io/repo/.
function resolveAssetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

function loadRealImage(path: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      realImages.set(path, img);
      resolve();
    };
    img.onerror = () => resolve(); // leave the procedural fallback in place
    img.src = resolveAssetUrl(path);
  });
}

/** Kicks off loading every real sprite PNG the game ships, in parallel.
 * Fire-and-forget from main.ts — never awaited before first render, so a
 * slow load never delays instant-start; frames just start out procedural and
 * swap to real art the moment each file lands. */
export function preloadRealSprites(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const paths = new Set<string>();
  for (const slot of REAL_ASSET_SLOTS) for (const p of realImagePaths(slot)) paths.add(p);
  return Promise.all([...paths].map(loadRealImage)).then(() => undefined);
}

/** Returns a generated sprite frame for a slot, or null if that slot has no
 * generator yet (callers fall back to ASSET_MANIFEST's placeholder color) or
 * no DOM is available (e.g. a non-browser test environment). `frame` selects
 * an animation frame by index, wrapping if the slot has fewer frames. A real
 * preloaded PNG (see preloadRealSprites) always wins over the procedural
 * generator when both are available. */
export function getSpriteImage(slot: AssetSlot, frame = 0): HTMLCanvasElement | HTMLImageElement | null {
  if (typeof document === "undefined") return null;

  const candidates = realImagePaths(slot);
  if (candidates.length > 0) {
    const real = realImages.get(candidates[frame % candidates.length]);
    if (real) return real;
  }

  let frames = frameCache.get(slot);
  if (!frames) {
    const generated = generateFrames(slot);
    if (!generated) return null;
    frames = generated;
    frameCache.set(slot, frames);
  }

  return frames[frame % frames.length] ?? frames[0] ?? null;
}

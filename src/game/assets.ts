// Central manifest of every art slot the game will eventually need. Nothing
// here has real art yet — every slot resolves to a procedural placeholder —
// but the renderer only ever asks this module for a slot, never draws a
// hardcoded color itself, so dropping in PNGs later is a manifest edit, not
// a rendering-code edit.
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
  | "icon.ammo"
  | "icon.health"
  | "icon.exit"
  | "hud.health"
  | "hud.ammo"
  | "hud.enemies";

export interface AssetManifestEntry {
  /** Suggested source pixel size once real art replaces the placeholder. */
  suggestedSize: [number, number];
  /** Flat placeholder color used until a real sprite sheet is assigned. */
  placeholderColor: string;
  /** Where the eventual PNG would live, relative to /public. */
  path: string;
}

export const ASSET_MANIFEST: Record<AssetSlot, AssetManifestEntry> = {
  "wall.a": { suggestedSize: [64, 64], placeholderColor: "#a9c7d8", path: "sprites/wall-a.png" },
  "wall.b": { suggestedSize: [64, 64], placeholderColor: "#8fb3c9", path: "sprites/wall-b.png" },
  door: { suggestedSize: [64, 64], placeholderColor: "#d9c9e8", path: "sprites/door.png" },
  "enemy.grunt.idle": { suggestedSize: [48, 64], placeholderColor: "#ffd166", path: "sprites/grunt-idle.png" },
  "enemy.grunt.hit": { suggestedSize: [48, 64], placeholderColor: "#ffffff", path: "sprites/grunt-hit.png" },
  "enemy.grunt.death": { suggestedSize: [48, 64], placeholderColor: "#c98f3d", path: "sprites/grunt-death.png" },
  "enemy.scout.idle": { suggestedSize: [48, 64], placeholderColor: "#7fd6c2", path: "sprites/scout-idle.png" },
  "enemy.scout.hit": { suggestedSize: [48, 64], placeholderColor: "#ffffff", path: "sprites/scout-hit.png" },
  "enemy.scout.death": { suggestedSize: [48, 64], placeholderColor: "#4f9e8c", path: "sprites/scout-death.png" },
  "enemy.brute.idle": { suggestedSize: [64, 80], placeholderColor: "#e07a7a", path: "sprites/brute-idle.png" },
  "enemy.brute.hit": { suggestedSize: [64, 80], placeholderColor: "#ffffff", path: "sprites/brute-hit.png" },
  "enemy.brute.death": { suggestedSize: [64, 80], placeholderColor: "#a44d4d", path: "sprites/brute-death.png" },
  "weapon.idle": { suggestedSize: [128, 128], placeholderColor: "#cfd8e3", path: "sprites/weapon-idle.png" },
  "weapon.fire": { suggestedSize: [128, 128], placeholderColor: "#fff3b0", path: "sprites/weapon-fire.png" },
  "icon.ammo": { suggestedSize: [32, 32], placeholderColor: "#ffe066", path: "sprites/icon-ammo.png" },
  "icon.health": { suggestedSize: [32, 32], placeholderColor: "#ff8fa3", path: "sprites/icon-health.png" },
  "icon.exit": { suggestedSize: [64, 64], placeholderColor: "#baffc9", path: "sprites/icon-exit.png" },
  "hud.health": { suggestedSize: [24, 24], placeholderColor: "#ff8fa3", path: "sprites/hud-health.png" },
  "hud.ammo": { suggestedSize: [24, 24], placeholderColor: "#ffe066", path: "sprites/hud-ammo.png" },
  "hud.enemies": { suggestedSize: [24, 24], placeholderColor: "#a9c7d8", path: "sprites/hud-enemies.png" },
};

const imageCache = new Map<AssetSlot, HTMLImageElement | null>();

/** Returns a loaded sprite image for a slot, or null if none has been
 * assigned yet — callers fall back to ASSET_MANIFEST's placeholder color.
 * No slot has a real image today; this only stops returning null once a
 * PNG is actually dropped into /public and wired in here. */
export function getSpriteImage(_slot: AssetSlot): HTMLImageElement | null {
  return imageCache.get(_slot) ?? null;
}

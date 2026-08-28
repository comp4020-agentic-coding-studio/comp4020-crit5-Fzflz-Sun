// Shared tunables. Kept in one place so difficulty/feel adjustments after
// playtesting don't require hunting through every module.

export const INTERNAL_WIDTH = 320;
export const INTERNAL_HEIGHT = 200;

export const FOV_RADIANS = (66 * Math.PI) / 180;
export const MAX_RENDER_DIST = 20;

// Screen fraction devoted to ceiling above the wall midline. Biased above
// 0.5 so a room's ceiling reads as taller than its floor even when no wall
// fills the frame — a cheap 2D projection trick, not real pitch/look.
export const HORIZON_RATIO = 0.6;

// A textured wall's brightness never drops below this fraction of full
// brightness, however far away — keeps the space reading as a lit indoor
// room instead of fading toward a dark dungeon at range.
export const WALL_BRIGHTNESS_FLOOR = 0.7;

// The bright, low-contrast "cheap educational software" palette. Read by
// assets.ts's procedural sprite generator so every drawn shape shares one
// source of truth for color.
export const COLOR_CYAN = "#9DE1E2";
export const COLOR_ICE = "#BCD8EA";
export const COLOR_LAVENDER = "#B7A6E5";
export const COLOR_PINK = "#DB72B5";
export const COLOR_PEACH = "#F1A36B";
export const COLOR_CREAM = "#FFE7A1";
export const COLOR_FLOOR = "#71869B";
export const COLOR_INK = "#26364C";

export const PLAYER_RADIUS = 0.2;
export const PLAYER_MOVE_SPEED = 1.55; // tiles/sec, forward
export const PLAYER_MOVE_SPEED_BACK = 1.2; // tiles/sec, reverse — deliberately a little slower
export const PLAYER_TURN_SPEED = (115 * Math.PI) / 180; // rad/sec, continuous — dull, schoolroom-computer turning
export const RENDER_ANGLE_STEPS = 32; // quantized viewing direction only

// On-screen billboard scale. Small figures in wide rooms is the intended
// look, so these stay well under 1.
export const ENEMY_SCALE = 0.62;
export const BRUTE_SCALE = 0.8;
export const PICKUP_SCALE = 0.32;
export const PROJECTILE_SCALE = 0.22;
export const EXIT_SCALE = 1.0;

// Native 64x64 weapon frames drawn at a strict integer 2x — 128x128 — so
// every source pixel maps to an even 2x2 block with no fractional scaling.
export const WEAPON_DRAW_WIDTH = 128;
export const WEAPON_DRAW_HEIGHT = 128;

// How long the fire sprite (4 real frames) plays before falling back to
// idle — matched to the disc-launcher's fire animation window, well inside
// FIRE_COOLDOWN so the next shot's cooldown doesn't cut the animation short.
export const WEAPON_FIRE_ANIM_DURATION = 0.14;

export const DOOR_OPEN_RADIUS = 0.75;

export const FIRE_COOLDOWN = 0.32; // seconds between hitscan shots
export const HITSCAN_DAMAGE = 1;
export const HITSCAN_RANGE = 14;
// Old shareware FPS games have no crosshair or vertical aim; hitting whatever
// is roughly dead ahead reads as fair without one. This is that tolerance.
// Must clear RENDER_ANGLE_STEPS' half-step (360/32/2 = 5.625deg) or even a
// dead-on-aimed shot can whiff purely from render-angle rounding.
export const HITSCAN_AIM_TOLERANCE = (7 * Math.PI) / 180;

export const PICKUP_RADIUS = 0.45;
export const EXIT_RADIUS = 0.6;

export const ENEMY_RADIUS = 0.3;
export const ENEMY_STOP_DISTANCE = 0.9;
export const KNOCKBACK_DISTANCE = 0.15;

export const PROJECTILE_RADIUS = 0.15;
export const PROJECTILE_TTL = 6;

export const HIT_FLASH_DURATION = 0.15;
export const DEATH_PARTICLE_COUNT = 10;
export const DEATH_PARTICLE_TTL = 0.5;
export const MUZZLE_PARTICLE_TTL = 0.08;

export const STARTING_HEALTH = 100;
export const STARTING_AMMO = 24;

// A frame after an alt-tab or a mobile app-switch can report a huge dt; cap
// it so the sim can't lurch (an enemy teleporting through a wall, a hitscan
// firing many times in one tick).
export const MAX_DT = 1 / 20;

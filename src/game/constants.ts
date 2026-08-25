// Shared tunables. Kept in one place so difficulty/feel adjustments after
// playtesting don't require hunting through every module.

export const INTERNAL_WIDTH = 320;
export const INTERNAL_HEIGHT = 200;

export const FOV_RADIANS = (66 * Math.PI) / 180;
export const MAX_RENDER_DIST = 20;

export const PLAYER_RADIUS = 0.2;
export const PLAYER_MOVE_SPEED = 3.0; // tiles/sec
export const PLAYER_TURN_SPEED = Math.PI * 1.6; // rad/sec, continuous
export const RENDER_ANGLE_STEPS = 32; // quantized viewing direction only

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

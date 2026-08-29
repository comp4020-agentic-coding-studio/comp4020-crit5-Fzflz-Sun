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
export const PLAYER_MOVE_SPEED = 1.95; // tiles/sec, forward
export const PLAYER_MOVE_SPEED_BACK = 1.55; // tiles/sec, reverse — deliberately a little slower
export const PLAYER_TURN_SPEED = (160 * Math.PI) / 180; // rad/sec, continuous — tank turn, tuned brisk not sluggish
export const RENDER_ANGLE_STEPS = 32; // quantized viewing direction only

// On-screen billboard scale. Small figures in wide rooms is the intended
// look, so these stay well under 1.
export const ENEMY_SCALE = 0.62;
export const BRUTE_SCALE = 0.8;
export const PICKUP_SCALE = 0.32;
export const PEDESTAL_SCALE = 0.55;
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

export const FIRE_COOLDOWN = 0.28; // seconds between hitscan shots
export const HITSCAN_DAMAGE = 1;
export const HITSCAN_RANGE = 14;
// Old shareware FPS games have no crosshair or vertical aim; hitting whatever
// is roughly dead ahead reads as fair without one. This is that tolerance.
// Must clear RENDER_ANGLE_STEPS' half-step (360/32/2 = 5.625deg) or even a
// dead-on-aimed shot can whiff purely from render-angle rounding.
export const HITSCAN_AIM_TOLERANCE = (9.5 * Math.PI) / 180;

export const PICKUP_RADIUS = 0.45;
export const EXIT_RADIUS = 0.6;

export const ENEMY_RADIUS = 0.3;
export const ENEMY_STOP_DISTANCE = 0.9;
export const KNOCKBACK_DISTANCE = 0.23;

export const PROJECTILE_RADIUS = 0.15;
export const PROJECTILE_TTL = 6;

export const HIT_FLASH_DURATION = 0.15;
export const DEATH_PARTICLE_COUNT = 12;
export const DEATH_PARTICLE_TTL = 0.5;
export const MUZZLE_PARTICLE_TTL = 0.08;

export const STARTING_HEALTH = 100;
export const STARTING_AMMO = 16;

// A frame after an alt-tab or a mobile app-switch can report a huge dt; cap
// it so the sim can't lurch (an enemy teleporting through a wall, a hitscan
// firing many times in one tick).
export const MAX_DT = 1 / 20;

// A shot this forgiving only ever applies to destroying an incoming
// projectile, never to hitting an enemy — kept well clear of
// HITSCAN_AIM_TOLERANCE so "clear the shot" always reads as easier than
// "land the hit".
export const PROJECTILE_DESTROY_AIM_TOLERANCE = (14 * Math.PI) / 180;
export const PROJECTILE_DESTROY_RANGE = HITSCAN_RANGE;

// Room-encounter/wave pacing.
export const MAX_SIMULTANEOUS_ENEMIES = 3;
export const SPAWN_TELEGRAPH_DURATION = 0.5;
export const WAVE_PAUSE_DURATION = 1.2;
export const BRUTE_TELEGRAPH_DURATION = 0.6;

// Kill feedback.
export const HITSTOP_KILL_NORMAL = 0.045;
export const HITSTOP_KILL_BRUTE = 0.06;
export const HIT_PARTICLE_COUNT = 3;
export const KILL_PARTICLE_MULTIPLIER = 1.6;
export const BRUTE_KILL_PARTICLE_MULTIPLIER = 2.2;

// Score / combo. Multiplier climbs with an uninterrupted kill streak and
// resets to x1 only when the player takes damage — no time-based decay.
export const SCORE_GRUNT = 100;
export const SCORE_SCOUT = 150;
export const SCORE_BRUTE = 250;
export const COMBO_KILLS_PER_STEP = 3;
export const COMBO_MAX_MULTIPLIER = 4;

// Upgrade pedestals: walk-over world objects, not a menu.
export const PEDESTAL_SELECT_RADIUS = 0.6;
export const PEDESTAL_HINT_RADIUS = 2.2;

// Kill-triggered resource drops — deterministic (not RNG), so ammo/health
// sustain scales with how many enemies the player has actually cleared.
export const KILL_AMMO_DROP_INTERVAL = 3;
export const KILL_AMMO_DROP_AMOUNT = 6;
export const KILL_AMMO_DROP_AMOUNT_SALVAGE = 9;
export const BRUTE_HEALTH_DROP_AMOUNT = 20;
export const BRUTE_HEALTH_DROP_AMOUNT_SALVAGE = 28;

// Upgrade effect magnitudes.
export const RAPID_COOLDOWN_MULTIPLIER = 0.75;
export const IMPACT_DAMAGE_MULTIPLIER = 2;
export const IMPACT_KNOCKBACK_MULTIPLIER = 1.6;

export const HINT_DISPLAY_DURATION = 4.5;

// Contact damage is a discrete, cooldown-gated lump (enemy.damage times this
// interval) rather than enemy.damage*dt applied every single frame of
// overlap — the latter is what turned sustained contact into ~120 hurt
// audio events/sec once collision let the player and an enemy fully
// coincide. DPS is unchanged; only the granularity is.
export const CONTACT_DAMAGE_INTERVAL = 0.28;

// Minimum center-to-center distance the player and enemies (or two enemies)
// are allowed to end a frame at. Prevents the player from passing fully
// through an enemy and an enemy from parking on the player's exact center,
// which is what let contact damage tick forever at zero relative distance.
export const PLAYER_ENEMY_MIN_DIST = PLAYER_RADIUS + ENEMY_RADIUS;
export const ENEMY_ENEMY_MIN_DIST = ENEMY_RADIUS * 2;
// Fixed number of separation passes per frame over enemy-enemy pairs so three
// enemies converging on the same point spread back out over a few frames
// instead of collapsing to it — bounded, never an unbounded relaxation loop.
export const SEPARATION_ITERATIONS = 3;

// Pre-spawn safety: an enemy must not spawn embedded in a wall, on top of the
// player, or stacked on another enemy. These are tried in order at the
// intended spawn point before falling back to a short, bounded retry delay —
// never an unbounded random-retry loop.
export const SPAWN_SAFE_PLAYER_DIST = PLAYER_ENEMY_MIN_DIST + 0.5;
export const SPAWN_SAFE_ENEMY_DIST = ENEMY_ENEMY_MIN_DIST + 0.2;
export const SPAWN_FALLBACK_OFFSETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 0.6, y: 0 },
  { x: -0.6, y: 0 },
  { x: 0, y: 0.6 },
  { x: 0, y: -0.6 },
  { x: 0.6, y: 0.6 },
  { x: -0.6, y: -0.6 },
];
export const SPAWN_RETRY_DELAY = 0.3;

// Audio: a fixed-size, round-robin voice pool per sound name replaces one
// `new Audio()` per playSound() call, and playerHurt additionally has its own
// global minimum replay interval so a burst of near-simultaneous damage
// events (contact and a projectile in the same instant, say) still can't
// spam the ear or the allocator.
export const AUDIO_VOICE_POOL_SIZE = 4;
export const PLAYER_HURT_MIN_REPLAY_INTERVAL = 0.2;

// Particle rendering/perf caps. Particles use a cheap single-fillRect draw
// path (see renderer.ts's drawParticles), capped in on-screen size so a
// particle spawned right at the camera can't balloon into a screen-filling
// square, and capped in total count so a burst of near-simultaneous deaths
// can't grow the array without bound.
export const MAX_ACTIVE_PARTICLES = 140;
export const PARTICLE_MAX_SCREEN_PX = 10;
export const PARTICLE_NEAR_CLIP = 0.08;

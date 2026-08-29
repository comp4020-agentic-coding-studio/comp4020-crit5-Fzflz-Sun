// Shared tunables. Kept in one place so difficulty/feel adjustments after
// playtesting don't require hunting through every module.
import type { UpgradeKind } from "./types";

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

// Wave phase timing (Section 3). A wave is combat (spawning active) ->
// cleanup (spawning stopped, residual enemies cleared/despawned) -> the
// screen switches to "upgrade" for the 3-choice pop-up -> "countdown" for
// WAVE_COUNTDOWN_DURATION -> back to combat at wave+1.
export const WAVE_COMBAT_DURATION = 45; // seconds, mid-point of the ~40-50s spec range
export const WAVE_CLEANUP_HIDE_DESPAWN = 15; // an unreached, hidden residual enemy despawns after this long
export const WAVE_CLEANUP_MAX_DURATION = 18; // hard cap even if a hider never shows — must exceed WAVE_CLEANUP_HIDE_DESPAWN
export const WAVE_COUNTDOWN_DURATION = 3;

export const SPAWN_TELEGRAPH_DURATION = 0.5;
export const BRUTE_TELEGRAPH_DURATION = 0.6;

// Spawn Director concurrency caps (Section 2/4). Difficulty comes from these
// tables plus spawn-interval/composition, never from unbounded enemy count,
// HP, or damage growth. Waves past the table's length reuse its last entry —
// a bounded cyclic-growth mode, not indefinite scaling.
export const WAVE_ACTIVE_CAP_TABLE: readonly number[] = [4, 6, 7, 8, 10];
export const MAX_ACTIVE_ENEMIES_HARD_CEILING = 12;
export const WAVE_RANGED_CAP = 4;

// Seconds between Director spawn attempts during combat phase; shrinks per
// wave down to a floor so pressure ramps without ever spawning unboundedly
// fast.
export const WAVE_SPAWN_INTERVAL_BASE = 3.2;
export const WAVE_SPAWN_INTERVAL_STEP = 0.25;
export const WAVE_SPAWN_INTERVAL_FLOOR = 1.4;

// Director anchor bookkeeping (Section 4): an anchor can't be reused until
// its cooldown elapses, and a spawn point must be at least this many tiles
// from the player.
export const SPAWN_ANCHOR_COOLDOWN = 6;
export const SPAWN_MIN_PLAYER_DIST = 6; // tiles, within the spec's 5-7 range
export const DIRECTOR_RECENT_MEMORY = 4; // how many recent anchors/zones are avoided

// Kill feedback. Hit-stop only freezes the enemy/world side of the sim (see
// state.ts's update()) — player input, movement, fire cooldown, the weapon
// animation and elapsed time keep running every frame — so these are tuned as
// a brief punch on the enemies around a kill, not a pause the player feels.
export const HITSTOP_KILL_NORMAL = 0.018;
export const HITSTOP_KILL_BRUTE = 0.028;
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

// Kill-triggered resource drops — deterministic (not RNG), so ammo/health
// sustain scales with how many enemies the player has actually cleared.
export const KILL_AMMO_DROP_INTERVAL = 3;
export const KILL_AMMO_DROP_AMOUNT = 6;
export const KILL_AMMO_DROP_AMOUNT_SALVAGE = 9;
export const BRUTE_HEALTH_DROP_AMOUNT = 20;
export const BRUTE_HEALTH_DROP_AMOUNT_SALVAGE = 28;

// Ground pickup bounding (Section 5/11): keeps state.pickups from growing
// without bound over an infinite run. A despawn TTL applies only to ordinary
// (non-critical) drops — the single most-recent kill drop gets ttl:-1 (never
// despawns) so a cap/TTL sweep can never delete the player's only supply.
export const MAX_GROUND_PICKUPS = 10;
export const PICKUP_DESPAWN_TTL = 20;

// Dead-enemy grace period (Section 5): killEnemy() already ran the death
// particle burst/hit-stop/drop synchronously, so this is just long enough for
// that to have visibly played before the enemy is spliced out of
// state.enemies — an infinite run must never let dead entries accumulate.
export const ENEMY_DEATH_GRACE = 0.6;

// Upgrade level caps (Section 6). Every kind has an explicit ceiling — no
// upgrade scales forever — and effectValue()/upgrades.ts is the single place
// that turns (kind, level) into a numeric effect.
export const UPGRADE_MAX_LEVEL: Record<UpgradeKind, number> = {
  rapid: 3,
  impact: 3,
  pierce: 3,
  salvage: 3,
  mobility: 3,
  vitality: 4,
  armour: 3,
  intercept: 3,
  combo: 3,
};

// Per-level effect steps — see upgrades.ts's effectValue() for how these
// combine with a level to a final numeric value.
export const RAPID_COOLDOWN_STEP = 0.09; // multiplied off FIRE_COOLDOWN per level
export const IMPACT_DAMAGE_STEP = 0.5; // extra HITSCAN_DAMAGE per level
export const IMPACT_KNOCKBACK_STEP = 0.25; // extra KNOCKBACK_DISTANCE multiplier per level
export const PIERCE_TARGETS_PER_LEVEL = 1; // extra hitscan targets per level
export const SALVAGE_DROP_BONUS_STEP = 0.25; // extra fraction on kill-drop amounts per level
export const MOBILITY_SPEED_STEP = 0.12; // extra PLAYER_MOVE_SPEED fraction per level
export const VITALITY_MAX_HEALTH_STEP = 20; // extra STARTING_HEALTH per level
export const ARMOUR_REDUCTION_STEP = 0.12; // fraction of incoming damage reduced per level, capped well under 1
export const ARMOUR_REDUCTION_CAP = 0.4;
export const INTERCEPT_AIM_TOLERANCE_STEP = (4 * Math.PI) / 180; // widens PROJECTILE_DESTROY_AIM_TOLERANCE per level
export const COMBO_MULTIPLIER_CAP_BONUS_STEP = 1; // extra COMBO_MAX_MULTIPLIER per level

// The 5-minute milestone (Section 7): a recorded, non-ending event, not a win
// condition.
export const MILESTONE_TIME_SECONDS = 5 * 60;

// Local save system (Section 9).
export const SAVE_STORAGE_KEY = "pie-hall-98:saves:v1";
export const SAVE_SLOT_COUNT = 3;
export const SAVE_SCHEMA_VERSION = 1;

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

// Audio. Playback is Web Audio API by default (see audio.ts): one shared
// AudioContext, each sound file fetched+decoded to an AudioBuffer exactly
// once, and every play() is a short-lived AudioBufferSourceNode — never a
// re-seek of something already playing. AUDIO_VOICE_POOL_SIZE and
// PLAYER_HURT_MIN_REPLAY_INTERVAL remain in use by the constrained HTMLAudio
// fallback path used only when Web Audio itself is unavailable.
export const AUDIO_VOICE_POOL_SIZE = 4;
export const PLAYER_HURT_MIN_REPLAY_INTERVAL = 0.2;

// fire.ogg runs ~1.3s — far longer than the fire interval (0.28s, 0.21s under
// Rapid) — so sustained fire is trimmed to just its punchy onset instead of
// playing full-length overlapping tails. AUDIO_FIRE_FADE_DURATION ramps the
// gain to 0 just before the clip's end to avoid an audible click from a hard
// cut.
export const AUDIO_FIRE_CLIP_DURATION = 0.15;
export const AUDIO_FIRE_FADE_DURATION = 0.03;

// Caps on concurrently-playing Web Audio sources — global across all sounds,
// and per sound name — so a burst (or a test driving hundreds of events in a
// tight loop) can only ever grow node count up to a bound, never without one.
export const AUDIO_MAX_ACTIVE_SOURCES_GLOBAL = 16;
export const AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND = 6;

// At most this many distinct sound *names* actually play in a single frame;
// see audio.ts's playEventSounds for the per-frame dedup/priority queue this
// bounds (same name collapses to one play regardless of budget).
export const AUDIO_MAX_EVENTS_PER_FRAME = 4;

// Particle rendering/perf caps. Particles use a cheap single-fillRect draw
// path (see renderer.ts's drawParticles), capped in on-screen size so a
// particle spawned right at the camera can't balloon into a screen-filling
// square, and capped in total count so a burst of near-simultaneous deaths
// can't grow the array without bound.
export const MAX_ACTIVE_PARTICLES = 140;
export const PARTICLE_MAX_SCREEN_PX = 10;
export const PARTICLE_NEAR_CLIP = 0.08;

// Enemy projectiles draw through their own cheap path (see renderer.ts's
// drawProjectiles) instead of the shared per-screen-column billboard loop:
// one drawImage/fillRect per projectile, sampling only a few z-buffer columns
// instead of every column the sprite would cover. Capped in on-screen size
// for the same "close to camera" reason as particles.
export const PROJECTILE_MAX_SCREEN_PX = 40;
export const PROJECTILE_NEAR_CLIP = 0.08;

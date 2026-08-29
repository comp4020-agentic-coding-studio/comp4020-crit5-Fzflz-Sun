import type { Rng } from "./rng";

export interface Vec2 {
  x: number;
  y: number;
}

// Top-level app state machine (crit-5 infinite-survival redesign). This is
// the single source of truth for input routing, world simulation, and
// rendering gates — no parallel booleans. "playing"/"countdown" are the only
// screens where the world sim advances; every other screen freezes the world
// and renders its last frame under a DOM menu overlay.
export type AppScreen =
  | "title"
  | "howToPlay"
  | "playing"
  | "paused"
  | "saveMenu"
  | "loadMenu"
  | "confirm"
  | "upgrade"
  | "countdown"
  | "dead"
  | "results";

export interface Player {
  pos: Vec2;
  angle: number;
  health: number;
  maxHealth: number;
  ammo: number;
  fireCooldown: number;
  // Independent of fireCooldown so the weapon-fire animation can keep
  // running (and always start from frame 0 on a real shot) even while
  // fireCooldown is a different length under an upgrade, and even during a
  // world hit-stop that must not visibly pause the player's own weapon.
  fireAnimationTimer: number;
}

export type EnemyKind = "grunt" | "scout" | "brute";
export type EnemyAiState = "idle" | "alert" | "dead";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  health: number;
  maxHealth: number;
  alive: boolean;
  state: EnemyAiState;
  flashTimer: number;
  fireCooldown: number;
  speed: number;
  damage: number;
  contactRadius: number;
  sightRange: number;
  fireInterval: number;
  projectileSpeed: number;
  // Ranged damage is tracked separately from `damage` (contact dps) so a
  // kind's melee threat and its projectile threat can be tuned independently.
  projectileDamage: number;
  // Brute-only wind-up before firing a telegraphed shot; 0 for other kinds.
  telegraphTimer: number;
  preferredRangeMin?: number;
  preferredRangeMax?: number;
  // Counts down while in contact range; a lump of damage applies only when
  // this reaches 0 (see CONTACT_DAMAGE_INTERVAL), instead of every frame.
  contactCooldown: number;
  // Grace period after death before removal from state.enemies — long enough
  // for the death particle burst / hit-stop / drop to have already happened
  // synchronously in killEnemy, short enough that the array never grows
  // unboundedly over an infinite run (see state.ts's cleanupDeadEnemies).
  deathTimer?: number;
}

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  damage: number;
}

export type PickupKind = "ammo" | "health";

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec2;
  collected: boolean;
  amount: number;
  // Seconds until an uncollected ordinary drop safely despawns; a negative
  // value means "never despawns" (the handful of fixed map pickups, and the
  // single most-recent kill drop). Keeps the pickup array bounded over an
  // infinite run without deleting critical supply the instant a cap is hit.
  ttl: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  maxTtl: number;
  color: string;
}

export interface Door {
  x: number;
  y: number;
  open: boolean;
  // A barrier door never opens by walking near it — only external code
  // toggles it — so proximity auto-open must skip it entirely.
  manual?: boolean;
  // Rendered as a pulsing energy-gate fill instead of the normal door
  // texture. Purely a rendering hint; open/closed behavior is unaffected.
  barrier?: boolean;
}

export type Cell = 0 | 1 | 2;

// A named region of the map, used for Spawn Director zone-diversity scoring
// and for zone-aware hints/labels. Bounding rect in tile coordinates,
// inclusive of x0/y0, exclusive of x1/y1.
export interface ZoneDef {
  id: string;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// A predefined point the Spawn Director may spawn an enemy at. The map
// defines a fixed, small (12-18) set of these — the director never invents a
// spawn point at runtime.
export interface SpawnAnchor {
  id: number;
  pos: Vec2;
  zoneId: string;
}

export interface LevelMap {
  width: number;
  height: number;
  cells: Cell[];
  doors: Door[];
  exit: Vec2;
  zones: ZoneDef[];
  anchors: SpawnAnchor[];
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fire: boolean;
}

export type UpgradeKind =
  | "rapid"
  | "impact"
  | "pierce"
  | "salvage"
  | "mobility"
  | "vitality"
  | "armour"
  | "intercept"
  | "combo";

export type UpgradeLevels = Record<UpgradeKind, number>;

export type WavePhase = "combat" | "cleanup";

// Only meaningful while screen === "playing"/"countdown". Advancing
// combat -> cleanup -> (screen=upgrade) -> (screen=countdown) -> combat is
// director.ts's advanceWave(), called from state.ts's update().
export interface WaveState {
  number: number;
  phase: WavePhase;
  timer: number;
  cleanupTimer: number;
  activeCap: number;
  rangedCap: number;
  spawnInterval: number;
  spawnTimer: number;
}

// Spawn Director bookkeeping: per-anchor cooldown (seconds remaining before
// that anchor may be reused) plus a short memory of recently-used anchors and
// zones so consecutive spawns don't pile onto the same point/zone the player
// just passed.
export interface DirectorState {
  anchorCooldowns: Record<number, number>;
  recentAnchors: number[];
  recentZoneIds: string[];
}

// Permanent, plain-number kill counters — never a growing array of dead-enemy
// objects (Section 5's explicit "no per-kill object history" requirement).
export interface PlayerStats {
  totalKills: number;
  gruntKills: number;
  scoutKills: number;
  bruteKills: number;
}

// A brief telegraph marker for an about-to-appear enemy (replaces the old
// EncounterState's PendingSpawn). Purely visual + a delay before the real
// Enemy is pushed into state.enemies.
export interface SpawnTelegraph {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  timer: number;
}

export type ConfirmKind = "overwriteSave" | "restartRun" | "endRun" | "returnToMenu" | "deleteSave" | "endGame";

export interface PendingConfirm {
  kind: ConfirmKind;
  slot?: number;
}

export interface ResultsSnapshot {
  survivalTime: number;
  wave: number;
  totalKills: number;
  gruntKills: number;
  scoutKills: number;
  bruteKills: number;
  score: number;
  bestMultiplier: number;
  upgrades: UpgradeLevels;
  milestoneReached: boolean;
  grade: string;
}

// Exactly the fields a save persists — never audio/canvas/DOM/particles/
// hit-stop/telegraphs, all of which are rebuilt fresh after a load. See
// save.ts's serializeSave/restoreSave.
export interface SaveDataV1 {
  version: 1;
  savedAt: number;
  rngState: number;
  player: { pos: Vec2; angle: number; health: number; maxHealth: number; ammo: number; fireCooldown: number };
  score: number;
  multiplier: number;
  bestMultiplier: number;
  comboKills: number;
  damageTaken: number;
  stats: PlayerStats;
  wave: WaveState;
  director: DirectorState;
  upgrades: UpgradeLevels;
  enemies: Enemy[];
  pickups: Pickup[];
  doorStates: Array<{ x: number; y: number; open: boolean }>;
  milestoneReached: boolean;
  elapsed: number;
}

export interface GameState {
  screen: AppScreen;

  map: LevelMap;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  particles: Particle[];
  telegraphs: SpawnTelegraph[];

  elapsed: number;
  nextId: number;

  // Generic countdown for the two screens that auto-advance on a timer:
  // "countdown" (WAVE_COUNTDOWN_DURATION, then -> beginWave/"playing") and
  // "dead" (a brief beat before -> "results"). Meaningless on every other
  // screen; one field covers both since they're mutually exclusive.
  screenTimer: number;

  wave: WaveState;
  director: DirectorState;
  rng: Rng;

  score: number;
  multiplier: number;
  bestMultiplier: number;
  comboKills: number;
  damageTaken: number;
  stats: PlayerStats;

  hitStopTimer: number;

  // Bumped by applyPlayerDamage() every time the player actually loses
  // health, from any source. Audio/HUD/combo-reset logic all key off a
  // change in this value instead of comparing health across frames, which
  // can't distinguish "one real hit" from natural per-frame noise and can't
  // be throttled independently of the damage amount itself.
  hurtEventId: number;

  hintShown: boolean;
  hintTimer: number;
  projectilesDestroyed: number;

  upgrades: UpgradeLevels;
  // Exactly 0 (no menu open) or 3 (menu open) distinct upgrade kinds, drawn
  // deterministically via state.rng — see upgrades.ts's rollUpgradeOptions.
  upgradeOptions: UpgradeKind[];

  milestoneReached: boolean;
  milestoneBannerTimer: number;

  pendingConfirm: PendingConfirm | null;
  // Where "Back"/"Cancel" returns to from saveMenu/loadMenu/confirm.
  menuReturnScreen: AppScreen | null;
  saveNotice: string | null;
  activeSlot: number | null;
  results: ResultsSnapshot | null;
}

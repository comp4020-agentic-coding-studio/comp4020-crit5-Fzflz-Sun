export interface Vec2 {
  x: number;
  y: number;
}

export type Phase = "playing" | "won" | "lost";

export interface Player {
  pos: Vec2;
  angle: number;
  health: number;
  maxHealth: number;
  ammo: number;
  fireCooldown: number;
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
  // A barrier door never opens by walking near it — only the encounter
  // controller toggles it via setGateOpen — so proximity auto-open must skip
  // it entirely.
  manual?: boolean;
  // Rendered as a pulsing energy-gate fill instead of the normal door
  // texture. Purely a rendering hint; open/closed behavior is unaffected.
  barrier?: boolean;
}

export type Cell = 0 | 1 | 2;

export interface LevelMap {
  width: number;
  height: number;
  cells: Cell[];
  doors: Door[];
  exit: Vec2;
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fire: boolean;
  restart: boolean;
}

export type UpgradeKind = "rapid" | "impact" | "pierce" | "salvage";

export interface Pedestal {
  id: number;
  kind: UpgradeKind;
  pos: Vec2;
}

export type EncounterStage =
  | "tutorial"
  | "upgrade1"
  | "freeRoam"
  | "roomB"
  | "upgrade2"
  | "freeRoamToC"
  | "roomC"
  | "done";

export interface WaveSpawnDef {
  kind: EnemyKind;
  pos: Vec2;
}

export interface PendingSpawn extends WaveSpawnDef {
  telegraphTimer: number;
}

export interface EncounterState {
  stage: EncounterStage;
  waveIndex: number;
  waveQueue: WaveSpawnDef[];
  pending: PendingSpawn[];
  pauseTimer: number;
}

export interface UpgradeFlags {
  rapid: boolean;
  impact: boolean;
  pierce: boolean;
  salvage: boolean;
}

export interface GameState {
  map: LevelMap;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  particles: Particle[];
  pedestals: Pedestal[];
  phase: Phase;
  elapsed: number;
  nextId: number;

  encounter: EncounterState;

  score: number;
  multiplier: number;
  bestMultiplier: number;
  comboKills: number;
  killCount: number;
  damageTaken: number;

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

  upgrades: UpgradeFlags;
  upgradeChoice1: UpgradeKind | null;
  upgradeChoice2: UpgradeKind | null;
}

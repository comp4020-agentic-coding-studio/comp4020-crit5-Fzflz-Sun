// Shared types for the raycaster game. Kept separate from rendering and
// asset code so a future art pass never has to touch game rules.

export interface Vec2 {
  x: number;
  y: number;
}

export type Phase = "playing" | "won" | "lost";

export interface Player {
  pos: Vec2;
  angle: number; // radians, continuous — turning and movement both use this
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
}

/** 0 = floor, 1 = wall variant A, 2 = wall variant B. Doors overlay a floor
 * cell and are tracked separately since their solidity changes at runtime. */
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

export interface GameState {
  map: LevelMap;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  particles: Particle[];
  phase: Phase;
  elapsed: number;
  nextId: number;
}

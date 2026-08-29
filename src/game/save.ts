// Local 3-slot save system (Section 9). Every read/write is wrapped so a
// disabled/quota-exceeded localStorage, or a corrupt/old-version slot, is
// always treated as "unavailable"/"empty" — this module must never throw out
// to a caller, since a broken save must never crash the game.
import type { Door, Enemy, GameState, Pickup, SaveDataV1, UpgradeKind } from "./types";
import { buildLevel } from "./level";
import { createUpgradeLevels } from "./upgrades";
import { restoreRng } from "./rng";
import { UPGRADE_LABEL } from "./hud";
import { SAVE_SCHEMA_VERSION, SAVE_SLOT_COUNT, SAVE_STORAGE_KEY } from "./constants";

interface SaveFile {
  slots: Array<SaveDataV1 | null>;
}

export interface SaveSlotSummary {
  slot: number;
  empty: boolean;
  savedAt: number;
  survivalTime: number;
  wave: number;
  score: number;
  totalKills: number;
  upgradeSummary: string;
}

function emptySummary(slot: number): SaveSlotSummary {
  return { slot, empty: true, savedAt: 0, survivalTime: 0, wave: 0, score: 0, totalKills: 0, upgradeSummary: "" };
}

/** Never throws — a disabled/private-mode/quota-exceeded localStorage reads
 * back as "unavailable", exactly like an empty slot, rather than crashing. */
export function isStorageAvailable(): boolean {
  try {
    const key = "__pie-hall-98:probe__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readSaveFile(): SaveFile {
  const empty: SaveFile = { slots: Array.from({ length: SAVE_SLOT_COUNT }, () => null) };
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("slots" in parsed)) return empty;
    const slots = (parsed as { slots: unknown }).slots;
    if (!Array.isArray(slots)) return empty;
    return { slots: Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => validateSaveData(slots[i]) ? (slots[i] as SaveDataV1) : null) };
  } catch {
    return empty;
  }
}

function writeSaveFile(file: SaveFile): boolean {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

/** Structural + version validation only — tolerant of a slot written by a
 * future/older schema version or of hand-edited/corrupt JSON. Never throws;
 * any mismatch simply fails validation so the caller treats it as empty. */
function validateSaveData(data: unknown): data is SaveDataV1 {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.version !== SAVE_SCHEMA_VERSION) return false;
  if (typeof d.rngState !== "number") return false;
  if (typeof d.player !== "object" || d.player === null) return false;
  if (typeof d.wave !== "object" || d.wave === null) return false;
  if (typeof d.director !== "object" || d.director === null) return false;
  if (typeof d.upgrades !== "object" || d.upgrades === null) return false;
  if (!Array.isArray(d.enemies) || !Array.isArray(d.pickups) || !Array.isArray(d.doorStates)) return false;
  if (typeof d.elapsed !== "number" || typeof d.score !== "number" || typeof d.stats !== "object") return false;
  return true;
}

function upgradeSummaryOf(upgrades: Record<UpgradeKind, number>): string {
  const lines = (Object.keys(upgrades) as UpgradeKind[])
    .filter((k) => upgrades[k] > 0)
    .map((k) => `${UPGRADE_LABEL[k]} L${upgrades[k]}`);
  return lines.length > 0 ? lines.join(", ") : "None";
}

/** Reads all 3 slots' display metadata for the save/load menu — never the
 * full GameState, so listing slots never needs to touch the map/rng. */
export function listSlotSummaries(): SaveSlotSummary[] {
  if (!isStorageAvailable()) return Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => emptySummary(i));
  const file = readSaveFile();
  return file.slots.map((data, i) => {
    if (!data) return emptySummary(i);
    return {
      slot: i,
      empty: false,
      savedAt: data.savedAt,
      survivalTime: data.elapsed,
      wave: data.wave.number,
      score: data.score,
      totalKills: data.stats.totalKills,
      upgradeSummary: upgradeSummaryOf(data.upgrades),
    };
  });
}

/** Picks exactly the persistent fields (Section 9) — never audio/canvas/DOM/
 * particles/hit-stop/telegraphs/projectiles, all rebuilt fresh on load. */
export function serializeSave(state: GameState): SaveDataV1 {
  return {
    version: SAVE_SCHEMA_VERSION,
    savedAt: Date.now(),
    rngState: state.rng.state,
    player: {
      pos: { ...state.player.pos },
      angle: state.player.angle,
      health: state.player.health,
      maxHealth: state.player.maxHealth,
      ammo: state.player.ammo,
      fireCooldown: state.player.fireCooldown,
    },
    score: state.score,
    multiplier: state.multiplier,
    bestMultiplier: state.bestMultiplier,
    comboKills: state.comboKills,
    damageTaken: state.damageTaken,
    stats: { ...state.stats },
    wave: { ...state.wave },
    director: {
      anchorCooldowns: { ...state.director.anchorCooldowns },
      recentAnchors: [...state.director.recentAnchors],
      recentZoneIds: [...state.director.recentZoneIds],
    },
    upgrades: { ...state.upgrades },
    enemies: state.enemies.map((e) => ({ ...e, pos: { ...e.pos } })),
    pickups: state.pickups.filter((p) => !p.collected).map((p) => ({ ...p, pos: { ...p.pos } })),
    doorStates: state.map.doors.map((d) => ({ x: d.x, y: d.y, open: d.open })),
    milestoneReached: state.milestoneReached,
    elapsed: state.elapsed,
  };
}

function applyDoorStates(doors: Door[], saved: Array<{ x: number; y: number; open: boolean }>): void {
  for (const s of saved) {
    const door = doors.find((d) => d.x === s.x && d.y === s.y);
    if (door) door.open = s.open;
  }
}

/** Rebuilds a full GameState from a validated save: fresh map (doors then
 * re-applied from the saved state), rng resumed from its exact saved
 * sequence position, every transient array (projectiles/particles/
 * telegraphs) starts empty. Returns null only if something inside the
 * (already-validated) data is structurally unusable — kept defensive since
 * this still runs on data a previous app version may have written. */
export function restoreSave(data: SaveDataV1): GameState | null {
  try {
    const map = buildLevel();
    applyDoorStates(map.doors, data.doorStates);

    const enemies: Enemy[] = data.enemies.map((e) => ({ ...e, pos: { ...e.pos } }));
    const pickups: Pickup[] = data.pickups.map((p) => ({ ...p, pos: { ...p.pos } }));

    const state: GameState = {
      screen: "playing",
      map,
      player: {
        pos: { ...data.player.pos },
        angle: data.player.angle,
        health: data.player.health,
        maxHealth: data.player.maxHealth,
        ammo: data.player.ammo,
        fireCooldown: data.player.fireCooldown,
        fireAnimationTimer: 0,
      },
      enemies,
      projectiles: [],
      pickups,
      particles: [],
      telegraphs: [],
      elapsed: data.elapsed,
      nextId: 1_000_000, // saved ids may collide across a long run; a save is loaded far less often than IDs are minted, so jump the counter well clear rather than tracking a saved high-water mark.
      screenTimer: 0,
      wave: { ...data.wave },
      director: {
        anchorCooldowns: { ...data.director.anchorCooldowns },
        recentAnchors: [...data.director.recentAnchors],
        recentZoneIds: [...data.director.recentZoneIds],
      },
      rng: restoreRng(data.rngState),
      score: data.score,
      multiplier: data.multiplier,
      bestMultiplier: data.bestMultiplier,
      comboKills: data.comboKills,
      damageTaken: data.damageTaken,
      stats: { ...data.stats },
      hitStopTimer: 0,
      hurtEventId: 0,
      hintShown: true,
      hintTimer: 0,
      projectilesDestroyed: 0,
      upgrades: { ...createUpgradeLevels(), ...data.upgrades },
      upgradeOptions: [],
      milestoneReached: data.milestoneReached,
      milestoneBannerTimer: 0,
      pendingConfirm: null,
      menuReturnScreen: null,
      saveNotice: null,
      activeSlot: null,
      results: null,
    };
    return state;
  } catch {
    return null;
  }
}

/** Writes `state` into `slot` (0-based). Returns false — surfaced by the
 * caller as a save-failed notice, never a thrown error — on an unavailable
 * or full localStorage. */
export function saveToSlot(state: GameState, slot: number): boolean {
  if (slot < 0 || slot >= SAVE_SLOT_COUNT) return false;
  if (!isStorageAvailable()) return false;
  const file = readSaveFile();
  file.slots[slot] = serializeSave(state);
  return writeSaveFile(file);
}

/** Loads `slot`, returning a ready-to-run GameState or null if the slot is
 * empty, storage is unavailable, or the saved data is corrupt/incompatible —
 * every one of those is the caller's cue to show "unavailable", not crash. */
export function loadFromSlot(slot: number): GameState | null {
  if (slot < 0 || slot >= SAVE_SLOT_COUNT) return null;
  if (!isStorageAvailable()) return null;
  const file = readSaveFile();
  const data = file.slots[slot];
  if (!data) return null;
  return restoreSave(data);
}

export function deleteSlot(slot: number): boolean {
  if (slot < 0 || slot >= SAVE_SLOT_COUNT) return false;
  if (!isStorageAvailable()) return false;
  const file = readSaveFile();
  file.slots[slot] = null;
  return writeSaveFile(file);
}

// The 9-kind leveled upgrade pool (Section 6) and the pure functions that
// turn (kind, level) into a numeric gameplay effect. Every kind has an
// explicit UPGRADE_MAX_LEVEL ceiling — nothing here scales forever. Reading
// these accessors is how combat.ts/enemies.ts replace the old boolean
// `state.upgrades.rapid` checks with level-scaled values.
import {
  ARMOUR_REDUCTION_CAP,
  ARMOUR_REDUCTION_STEP,
  COMBO_MAX_MULTIPLIER,
  COMBO_MULTIPLIER_CAP_BONUS_STEP,
  FIRE_COOLDOWN,
  IMPACT_DAMAGE_STEP,
  IMPACT_KNOCKBACK_STEP,
  KNOCKBACK_DISTANCE,
  MOBILITY_SPEED_STEP,
  PIERCE_TARGETS_PER_LEVEL,
  PLAYER_MOVE_SPEED,
  PLAYER_MOVE_SPEED_BACK,
  PROJECTILE_DESTROY_AIM_TOLERANCE,
  RAPID_COOLDOWN_STEP,
  SALVAGE_DROP_BONUS_STEP,
  STARTING_HEALTH,
  UPGRADE_MAX_LEVEL,
  VITALITY_MAX_HEALTH_STEP,
} from "./constants";
import type { GameState, UpgradeKind, UpgradeLevels } from "./types";
import { rngInt, rngSampleDistinct } from "./rng";

export const ALL_UPGRADE_KINDS: readonly UpgradeKind[] = [
  "rapid",
  "impact",
  "pierce",
  "salvage",
  "mobility",
  "vitality",
  "armour",
  "intercept",
  "combo",
];

export function createUpgradeLevels(): UpgradeLevels {
  const levels = {} as UpgradeLevels;
  for (const kind of ALL_UPGRADE_KINDS) levels[kind] = 0;
  return levels;
}

export const UPGRADE_NAME: Record<UpgradeKind, string> = {
  rapid: "Rapid Fire",
  impact: "Impact Rounds",
  pierce: "Piercing Shot",
  salvage: "Salvage Rig",
  mobility: "Mobility Boost",
  vitality: "Vitality",
  armour: "Armour Plating",
  intercept: "Intercept Training",
  combo: "Combo Mastery",
};

export const UPGRADE_DESCRIPTION: Record<UpgradeKind, string> = {
  rapid: "Shortens the handgun's cooldown between shots.",
  impact: "Hits land harder and knock enemies back further.",
  pierce: "A single shot passes through more targets.",
  salvage: "Kill drops yield more ammo and health.",
  mobility: "Move faster in every direction.",
  vitality: "Raises maximum health.",
  armour: "Reduces incoming damage from every source.",
  intercept: "Makes it easier to shoot down incoming projectiles.",
  combo: "Raises the score multiplier's ceiling.",
};

export const UPGRADE_KEY_HINT: Record<UpgradeKind, string> = {
  rapid: "1",
  impact: "2",
  pierce: "3",
  salvage: "1",
  mobility: "2",
  vitality: "3",
  armour: "1",
  intercept: "2",
  combo: "3",
};

/** The single headline numeric value a menu card shows for this kind at this
 * level — always the *next* level's magnitude, since a card offers a level-up. */
export function effectValue(kind: UpgradeKind, level: number): number {
  const next = level + 1;
  switch (kind) {
    case "rapid":
      return Math.round((1 - rapidCooldownMultiplier(next)) * 100);
    case "impact":
      return impactDamageBonus(next);
    case "pierce":
      return pierceMaxTargets(next);
    case "salvage":
      return Math.round(salvageBonusMultiplier(next) * 100 - 100);
    case "mobility":
      return Math.round((mobilitySpeedMultiplier(next) - 1) * 100);
    case "vitality":
      return vitalityMaxHealthBonus(next);
    case "armour":
      return Math.round(armourDamageReduction(next) * 100);
    case "intercept":
      return Math.round((interceptAimTolerance(next) * 180) / Math.PI);
    case "combo":
      return comboMaxMultiplier(next);
  }
}

export function rapidCooldownMultiplier(level: number): number {
  return Math.max(0.4, 1 - RAPID_COOLDOWN_STEP * level);
}
export function rapidFireCooldown(level: number): number {
  return FIRE_COOLDOWN * rapidCooldownMultiplier(level);
}
export function impactDamageBonus(level: number): number {
  return IMPACT_DAMAGE_STEP * level;
}
export function impactKnockback(level: number): number {
  return KNOCKBACK_DISTANCE * (1 + IMPACT_KNOCKBACK_STEP * level);
}
export function pierceMaxTargets(level: number): number {
  return 1 + PIERCE_TARGETS_PER_LEVEL * level;
}
export function salvageBonusMultiplier(level: number): number {
  return 1 + SALVAGE_DROP_BONUS_STEP * level;
}
export function mobilitySpeedMultiplier(level: number): number {
  return 1 + MOBILITY_SPEED_STEP * level;
}
export function mobilityForwardSpeed(level: number): number {
  return PLAYER_MOVE_SPEED * mobilitySpeedMultiplier(level);
}
export function mobilityBackSpeed(level: number): number {
  return PLAYER_MOVE_SPEED_BACK * mobilitySpeedMultiplier(level);
}
export function vitalityMaxHealthBonus(level: number): number {
  return VITALITY_MAX_HEALTH_STEP * level;
}
export function vitalityMaxHealth(level: number): number {
  return STARTING_HEALTH + vitalityMaxHealthBonus(level);
}
export function armourDamageReduction(level: number): number {
  return Math.min(ARMOUR_REDUCTION_CAP, ARMOUR_REDUCTION_STEP * level);
}
export function interceptAimTolerance(level: number): number {
  return PROJECTILE_DESTROY_AIM_TOLERANCE + level * ((4 * Math.PI) / 180);
}
export function comboMaxMultiplier(level: number): number {
  return COMBO_MAX_MULTIPLIER + COMBO_MULTIPLIER_CAP_BONUS_STEP * level;
}

type Category = "offense" | "survival" | "resource";
const CATEGORY: Record<UpgradeKind, Category> = {
  rapid: "offense",
  impact: "offense",
  pierce: "offense",
  combo: "offense",
  vitality: "survival",
  armour: "survival",
  intercept: "survival",
  salvage: "resource",
  mobility: "resource",
};

/** Simple threshold read of which axis the player is currently weakest on —
 * not RNG-critical, so ordinary state reads are fine here. */
function weakestCategory(state: GameState): Category {
  const healthFrac = state.player.health / state.player.maxHealth;
  if (healthFrac < 0.5) return "survival";
  const ammoFrac = state.player.ammo / Math.max(1, state.player.ammo + 4);
  if (ammoFrac < 0.3) return "resource";
  return "offense";
}

// Fixed filler, used only when fewer than 3 kinds are eligible (every other
// kind maxed) — keeps the menu at exactly 3 options even in that edge case.
const FILLER_ORDER: readonly UpgradeKind[] = ["vitality", "armour", "rapid", "salvage", "mobility"];

/** Generates the 3-choice upgrade menu deterministically from state.rng: no
 * duplicate kind, no maxed kind, at least one option relevant to the
 * player's currently weakest stat when available, and not all 3 from the
 * same category when a different-category option is still eligible. */
export function rollUpgradeOptions(state: GameState): UpgradeKind[] {
  const eligible = ALL_UPGRADE_KINDS.filter((k) => state.upgrades[k] < UPGRADE_MAX_LEVEL[k]);
  const picks: UpgradeKind[] = [];

  const weak = weakestCategory(state);
  const weakEligible = eligible.filter((k) => CATEGORY[k] === weak);
  if (weakEligible.length > 0) {
    picks.push(weakEligible[rngInt(state.rng, weakEligible.length)]!);
  }

  const remaining = eligible.filter((k) => !picks.includes(k));
  for (const k of rngSampleDistinct(state.rng, remaining, 3 - picks.length)) picks.push(k);

  if (picks.length === 3 && new Set(picks.map((k) => CATEGORY[k])).size === 1) {
    const alt = eligible.find((k) => !picks.includes(k) && CATEGORY[k] !== CATEGORY[picks[0]!]);
    if (alt) picks[picks.length - 1] = alt;
  }

  for (const filler of FILLER_ORDER) {
    if (picks.length >= 3) break;
    if (!picks.includes(filler)) picks.push(filler);
  }

  return picks.slice(0, 3);
}

/** Bumps the chosen kind's level (capped at its max) and closes the menu.
 * A no-op if `kind` isn't one of the currently-offered options — guards
 * against a stale click/key landing after the menu has already changed. */
export function applyUpgradeChoice(state: GameState, kind: UpgradeKind): void {
  if (!state.upgradeOptions.includes(kind)) return;
  const level = state.upgrades[kind];
  if (level < UPGRADE_MAX_LEVEL[kind]) state.upgrades[kind] = level + 1;
  state.upgradeOptions = [];
}

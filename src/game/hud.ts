// DOM-based HUD: icons and numbers only, wired up here so renderer.ts stays
// free of anything that isn't world-space drawing.
import type { GameState, UpgradeKind } from "./types";
import { PEDESTAL_HINT_RADIUS } from "./constants";
import { RANGED_ENEMY_HINT_TEXT, UPGRADE_DESCRIPTIONS } from "./encounters";

export interface HudRefs {
  healthValue: HTMLElement;
  ammoValue: HTMLElement;
  enemiesValue: HTMLElement;
  scoreValue: HTMLElement;
  multiplierValue: HTMLElement;
  timerValue: HTMLElement;
  hintBanner: HTMLElement;
  endOverlay: HTMLElement;
  endTitle: HTMLElement;
  endTime: HTMLElement;
  endScore: HTMLElement;
  endKills: HTMLElement;
  endCombo: HTMLElement;
  endUpgrades: HTMLElement;
  endGrade: HTMLElement;
}

export function getHudRefs(root: ParentNode): HudRefs {
  const req = (id: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(`missing HUD element #${id}`);
    return el;
  };
  return {
    healthValue: req("hud-health-value"),
    ammoValue: req("hud-ammo-value"),
    enemiesValue: req("hud-enemies-value"),
    scoreValue: req("hud-score-value"),
    multiplierValue: req("hud-multiplier-value"),
    timerValue: req("hud-timer-value"),
    hintBanner: req("hint-banner"),
    endOverlay: req("end-overlay"),
    endTitle: req("end-title"),
    endTime: req("end-time-value"),
    endScore: req("end-score-value"),
    endKills: req("end-kills-value"),
    endCombo: req("end-combo-value"),
    endUpgrades: req("end-upgrades-value"),
    endGrade: req("end-grade-value"),
  };
}

const UPGRADE_LABEL: Record<UpgradeKind, string> = {
  rapid: "Rapid",
  impact: "Impact",
  pierce: "Pierce",
  salvage: "Salvage",
};

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Deterministic S/A/B/C grade from completion time, score, and damage taken —
 * no hidden RNG, so the same run always grades the same. Thresholds are tuned
 * around the game's own target window (a clean run finishes in 3.5-4.5
 * minutes with a healthy combo and light damage taken). */
export function computeGrade(state: GameState): "S" | "A" | "B" | "C" {
  const timePoints = state.elapsed <= 270 ? 2 : state.elapsed <= 330 ? 1 : 0;
  const scorePoints = state.score >= 4000 ? 2 : state.score >= 2500 ? 1 : 0;
  const damagePoints = state.damageTaken <= 20 ? 2 : state.damageTaken <= 50 ? 1 : 0;
  const total = timePoints + scorePoints + damagePoints;
  if (total >= 5) return "S";
  if (total >= 3) return "A";
  if (total >= 1) return "B";
  return "C";
}

/** The hint banner shows at most one line at a time: a nearby upgrade
 * pedestal's description always wins over the one-time ranged-enemy tip,
 * since it's the more actionable/time-sensitive of the two. */
function activeHintText(state: GameState): string | null {
  let nearest: { dist: number; kind: UpgradeKind } | null = null;
  for (const pedestal of state.pedestals) {
    const dist = Math.hypot(pedestal.pos.x - state.player.pos.x, pedestal.pos.y - state.player.pos.y);
    if (dist <= PEDESTAL_HINT_RADIUS && (!nearest || dist < nearest.dist)) nearest = { dist, kind: pedestal.kind };
  }
  if (nearest) return UPGRADE_DESCRIPTIONS[nearest.kind];
  if (state.hintShown && state.hintTimer > 0) return RANGED_ENEMY_HINT_TEXT;
  return null;
}

let prevHealth = -1;
let prevAmmo = -1;
let prevEnemiesAlive = -1;
let prevScore = -1;
let prevMultiplier = -1;
let prevTimeText = "";
let prevHintText: string | null = "unset"; // never a real hint text or null on first frame
let prevEnded = false;
let endScreenWritten = false;

/** Sets textContent only when the value actually changed — every one of
 * these otherwise ran unconditionally every frame even though most HUD
 * fields (ammo between shots, score between kills, the timer within the
 * same displayed second) hold steady for dozens of frames at a stretch. */
function setText(el: HTMLElement, value: string): boolean {
  if (el.textContent === value) return false;
  el.textContent = value;
  return true;
}

/** Counts alive enemies without allocating an intermediate filtered array —
 * called every frame from the hot update loop. */
function countAlive(state: GameState): number {
  let n = 0;
  for (const enemy of state.enemies) if (enemy.alive) n++;
  return n;
}

function pulse(el: HTMLElement): void {
  // Cancel any pulse still mid-flight so two kills in quick succession both
  // visibly pulse, then restart via the Web Animations API — no CSS class
  // dance and no forced-reflow read (`el.offsetWidth`) needed to restart an
  // animation that's already running.
  for (const anim of el.getAnimations()) anim.cancel();
  el.animate([{ transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 180, easing: "ease-out" });
}

export function updateHud(state: GameState, refs: HudRefs): void {
  const health = Math.max(0, Math.ceil(state.player.health));
  if (health !== prevHealth) {
    setText(refs.healthValue, String(health));
    prevHealth = health;
  }

  if (state.player.ammo !== prevAmmo) {
    setText(refs.ammoValue, String(state.player.ammo));
    prevAmmo = state.player.ammo;
  }

  const enemiesAlive = countAlive(state);
  if (enemiesAlive !== prevEnemiesAlive) {
    setText(refs.enemiesValue, String(enemiesAlive));
    prevEnemiesAlive = enemiesAlive;
  }

  if (state.score !== prevScore) {
    if (prevScore !== -1) pulse(refs.scoreValue);
    setText(refs.scoreValue, String(state.score));
    prevScore = state.score;
  }

  if (state.multiplier !== prevMultiplier) {
    if (prevMultiplier !== -1) pulse(refs.multiplierValue);
    setText(refs.multiplierValue, `x${state.multiplier}`);
    prevMultiplier = state.multiplier;
  }

  const timeText = formatTime(state.elapsed);
  if (timeText !== prevTimeText) {
    setText(refs.timerValue, timeText);
    prevTimeText = timeText;
  }

  const hintText = activeHintText(state);
  if (hintText !== prevHintText) {
    setText(refs.hintBanner, hintText ?? "");
    refs.hintBanner.hidden = hintText === null;
    prevHintText = hintText;
  }

  const ended = state.phase !== "playing";
  if (ended !== prevEnded) {
    refs.endOverlay.hidden = !ended;
    refs.endOverlay.classList.toggle("is-win", state.phase === "won");
    refs.endOverlay.classList.toggle("is-lose", state.phase === "lost");
    prevEnded = ended;
    if (!ended) endScreenWritten = false;
  }

  // The end-screen stats are a one-time snapshot of the finished run — once
  // written for this game-over, every later frame's values are identical, so
  // there's nothing to re-diff or re-write until the next restart flips
  // `ended` back to false above and clears this flag.
  if (ended && !endScreenWritten) {
    refs.endTitle.textContent = state.phase === "won" ? "Cleared!" : "Defeated";
    refs.endTime.textContent = formatTime(state.elapsed);
    refs.endScore.textContent = String(state.score);
    refs.endKills.textContent = String(state.killCount);
    refs.endCombo.textContent = `x${state.bestMultiplier}`;
    const chosen = [state.upgradeChoice1, state.upgradeChoice2].filter((k): k is UpgradeKind => k !== null);
    refs.endUpgrades.textContent = chosen.length > 0 ? chosen.map((k) => UPGRADE_LABEL[k]).join(" + ") : "None";
    refs.endGrade.textContent = state.phase === "won" ? computeGrade(state) : "-";
    endScreenWritten = true;
  }
}

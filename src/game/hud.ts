// DOM-based HUD: icons and numbers only, wired up here so renderer.ts stays
// free of anything that isn't world-space drawing. Also owns the results
// screen (state.screen === "results") and the 5-minute milestone banner —
// both simple enough to share this module's diff-based update() rather than
// needing their own file.
import type { GameState, UpgradeKind } from "./types";
import { MILESTONE_TIME_SECONDS } from "./constants";

export interface HudRefs {
  healthValue: HTMLElement;
  ammoValue: HTMLElement;
  enemiesValue: HTMLElement;
  scoreValue: HTMLElement;
  multiplierValue: HTMLElement;
  timerValue: HTMLElement;
  waveValue: HTMLElement;
  hintBanner: HTMLElement;
  milestoneBanner: HTMLElement;
  resultsOverlay: HTMLElement;
  resultsTime: HTMLElement;
  resultsWave: HTMLElement;
  resultsScore: HTMLElement;
  resultsKills: HTMLElement;
  resultsCombo: HTMLElement;
  resultsUpgrades: HTMLElement;
  resultsMilestone: HTMLElement;
  resultsGrade: HTMLElement;
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
    waveValue: req("hud-wave-value"),
    hintBanner: req("hint-banner"),
    milestoneBanner: req("milestone-banner"),
    resultsOverlay: req("results-screen"),
    resultsTime: req("results-time-value"),
    resultsWave: req("results-wave-value"),
    resultsScore: req("results-score-value"),
    resultsKills: req("results-kills-value"),
    resultsCombo: req("results-combo-value"),
    resultsUpgrades: req("results-upgrades-value"),
    resultsMilestone: req("results-milestone-value"),
    resultsGrade: req("results-grade-value"),
  };
}

export const UPGRADE_LABEL: Record<UpgradeKind, string> = {
  rapid: "Rapid Fire",
  impact: "Impact",
  pierce: "Pierce",
  salvage: "Salvage",
  mobility: "Mobility",
  vitality: "Vitality",
  armour: "Armour",
  intercept: "Intercept",
  combo: "Combo",
};

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

let prevHealth = -1;
let prevAmmo = -1;
let prevEnemiesAlive = -1;
let prevScore = -1;
let prevMultiplier = -1;
let prevTimeText = "";
let prevWave = -1;
let prevHintText: string | null = "unset"; // never a real hint text or null on first frame
// null (not false) so the post-reset diff check below always fires on the
// next frame even when the new run's real value happens to be false too —
// otherwise an overlay left visible from the previous run never gets hidden.
let prevMilestoneShown: boolean | null = null;
let prevResultsShown: boolean | null = null;
let resultsWritten = false;

/** Resets every HUD diff cache — call once when a fresh run starts so a new
 * game's first frame always writes every field instead of trusting stale
 * values left over from a previous run's last frame. */
export function resetHudCache(): void {
  prevHealth = -1;
  prevAmmo = -1;
  prevEnemiesAlive = -1;
  prevScore = -1;
  prevMultiplier = -1;
  prevTimeText = "";
  prevWave = -1;
  prevHintText = "unset";
  prevMilestoneShown = null;
  prevResultsShown = null;
  resultsWritten = false;
}

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

function upgradeSummary(state: GameState): string {
  const lines = (Object.keys(state.upgrades) as UpgradeKind[])
    .filter((k) => state.upgrades[k] > 0)
    .map((k) => `${UPGRADE_LABEL[k]} L${state.upgrades[k]}`);
  return lines.length > 0 ? lines.join(", ") : "None";
}

function killSummary(state: GameState): string {
  const { stats } = state;
  return `${stats.totalKills} (G${stats.gruntKills} S${stats.scoutKills} B${stats.bruteKills})`;
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

  if (state.wave.number !== prevWave) {
    setText(refs.waveValue, String(state.wave.number));
    prevWave = state.wave.number;
  }

  const hintText = state.wave.phase === "cleanup" ? "Area clearing…" : null;
  if (hintText !== prevHintText) {
    setText(refs.hintBanner, hintText ?? "");
    refs.hintBanner.hidden = hintText === null;
    prevHintText = hintText;
  }

  const milestoneShown = state.milestoneBannerTimer > 0;
  if (milestoneShown !== prevMilestoneShown) {
    refs.milestoneBanner.hidden = !milestoneShown;
    if (milestoneShown) {
      setText(refs.milestoneBanner, `${Math.floor(MILESTONE_TIME_SECONDS / 60)}-minute milestone reached — keep going!`);
    }
    prevMilestoneShown = milestoneShown;
  }

  const resultsShown = state.screen === "results";
  if (resultsShown !== prevResultsShown) {
    refs.resultsOverlay.hidden = !resultsShown;
    prevResultsShown = resultsShown;
    if (!resultsShown) resultsWritten = false;
  }

  // The results snapshot is written once per run-end — every later frame's
  // values are identical until the next run clears resultsWritten above.
  if (resultsShown && !resultsWritten && state.results) {
    const r = state.results;
    refs.resultsTime.textContent = formatTime(r.survivalTime);
    refs.resultsWave.textContent = String(r.wave);
    refs.resultsScore.textContent = String(r.score);
    refs.resultsKills.textContent = killSummary(state);
    refs.resultsCombo.textContent = `x${r.bestMultiplier}`;
    refs.resultsUpgrades.textContent = upgradeSummary(state);
    refs.resultsMilestone.textContent = r.milestoneReached ? "Yes" : "No";
    refs.resultsGrade.textContent = r.grade;
    resultsWritten = true;
  }
}

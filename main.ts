// Bootstraps the game: wires input to the update loop to the renderer, and
// drives every DOM menu overlay off state.screen. Kept deliberately thin —
// every rule lives in src/game/*, this file only drives the frame clock, DOM
// plumbing, and "which overlay is showing right now" dispatch.
import { createTitleState, createInitialState, update, enterCountdown, endRunNow } from "./src/game/state";
import { createInputState, attachInput, resetInputState } from "./src/game/input";
import { renderFrame } from "./src/game/renderer";
import { getHudRefs, updateHud, resetHudCache, formatTime } from "./src/game/hud";
import { preloadRealSprites } from "./src/game/assets";
import { createAudioSnapshot, playEventSounds, unlockAudio } from "./src/game/audio";
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, MAX_DT, UPGRADE_MAX_LEVEL } from "./src/game/constants";
import { openPauseMenu, resumeFromPause, openSubMenu, closeSubMenu, requestConfirm, cancelConfirm, clearConfirm } from "./src/game/menu";
import { saveToSlot, loadFromSlot, deleteSlot, listSlotSummaries } from "./src/game/save";
import { UPGRADE_NAME, UPGRADE_DESCRIPTION, effectValue, applyUpgradeChoice } from "./src/game/upgrades";
import type { GameState, ConfirmKind, UpgradeKind } from "./src/game/types";

// Best-effort, non-blocking: real PNGs swap in as they land, but nothing here
// ever waits on them, so the instant-start requirement is unaffected.
void preloadRealSprites();

// Browser autoplay policy blocks sound (and suspends any AudioContext) until
// a real user gesture; the first keydown, touchstart, or pointerdown
// (keyboard, touch, or mouse click-to-fire, any of them counts) unlocks/
// resumes audio for the rest of the session.
function unlockAudioOnce(): void {
  unlockAudio();
  window.removeEventListener("keydown", unlockAudioOnce);
  window.removeEventListener("touchstart", unlockAudioOnce);
  window.removeEventListener("pointerdown", unlockAudioOnce);
}
window.addEventListener("keydown", unlockAudioOnce);
window.addEventListener("touchstart", unlockAudioOnce);
window.addEventListener("pointerdown", unlockAudioOnce);

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

const gameStage = document.querySelector<HTMLElement>("#game-stage")!;
const hud = document.querySelector<HTMLElement>("#hud")!;
const touchControls = document.querySelector<HTMLElement>("#touch-controls")!;

// The game world boots already-built (so New Game/Continue are instant) but
// sits on the title screen until the player picks something (Section 8).
let state: GameState = createTitleState();
const input = createInputState();
const hudRefs = getHudRefs(document);
let audioSnapshot = createAudioSnapshot(state);

function isGameActive(): boolean {
  return state.screen === "playing" || state.screen === "countdown";
}

attachInput(
  input,
  {
    canvas,
    forward: document.querySelector("#btn-forward"),
    backward: document.querySelector("#btn-backward"),
    turnLeft: document.querySelector("#btn-turn-left"),
    turnRight: document.querySelector("#btn-turn-right"),
    fire: document.querySelector("#btn-fire"),
    pause: document.querySelector("#btn-pause"),
  },
  isGameActive,
  () => {
    openPauseMenu(state, input);
    syncScreen();
  },
);

function isTouchLayout(): boolean {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

// The HUD bar and (on touch) the on-screen controls have their own
// screen-space height regardless of canvas scale, so they must be subtracted
// from the available height *before* fitting the canvas — otherwise the
// canvas is sized against the full viewport and the HUD/touch UI either
// overlaps it or pushes it off-screen, which is what produced the old
// large-gray-void bug on tall phone viewports.
function resizeCanvas(): void {
  const hudHeight = hud.getBoundingClientRect().height || 40;
  const touchHeight = isTouchLayout() ? touchControls.getBoundingClientRect().height + 24 : 0;
  const availableWidth = window.innerWidth;
  const availableHeight = Math.max(120, window.innerHeight - hudHeight - touchHeight);
  const scale = Math.min(availableWidth / INTERNAL_WIDTH, availableHeight / INTERNAL_HEIGHT);
  const width = INTERNAL_WIDTH * scale;
  const height = INTERNAL_HEIGHT * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  gameStage.style.width = `${width}px`;
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);
resizeCanvas();

// ---------------------------------------------------------------------------
// Menu overlay dispatch — exactly one of these ids is visible at a time,
// keyed off state.screen. "playing"/"countdown"/"dead"/"results" show none of
// them ("results" is hud.ts's own overlay, toggled from updateHud()).
// ---------------------------------------------------------------------------

const MENU_OVERLAY_IDS = ["title-screen", "how-to-play", "pause-menu", "save-menu", "load-menu", "confirm-dialog", "upgrade-menu"];
const SCREEN_TO_OVERLAY: Partial<Record<GameState["screen"], string>> = {
  title: "title-screen",
  howToPlay: "how-to-play",
  paused: "pause-menu",
  saveMenu: "save-menu",
  loadMenu: "load-menu",
  confirm: "confirm-dialog",
  upgrade: "upgrade-menu",
};

const CONFIRM_MESSAGES: Record<ConfirmKind, string> = {
  overwriteSave: "Overwrite the save in this slot?",
  restartRun: "Restart this run from wave 1? Current progress will be lost.",
  endRun: "End this run now and see your results?",
  returnToMenu: "Return to the main menu? Current progress will be lost.",
  deleteSave: "Delete this save slot? This cannot be undone.",
  endGame: "End the game and return to the title screen?",
};

let prevScreen: GameState["screen"] | null = null;

function setOverlayVisible(id: string, visible: boolean): void {
  const el = document.getElementById(id);
  if (el) el.hidden = !visible;
}

function renderSlotList(kind: "save" | "load"): void {
  const container = document.getElementById(kind === "save" ? "save-slot-list" : "load-slot-list")!;
  const status = document.getElementById(kind === "save" ? "save-status" : "load-status")!;
  status.textContent = "";
  container.innerHTML = "";

  for (const s of listSlotSummaries()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-option";

    if (s.empty) {
      btn.innerHTML = `<span class="slot-title">Slot ${s.slot + 1} — Empty</span>`;
      if (kind === "save") btn.addEventListener("click", () => doSave(s.slot));
      else btn.disabled = true;
      container.appendChild(btn);
      continue;
    }

    const when = new Date(s.savedAt).toLocaleString();
    btn.innerHTML = `<span class="slot-title">Slot ${s.slot + 1} — Wave ${s.wave}, Score ${s.score}</span><span class="slot-detail">${formatTime(s.survivalTime)} survived · ${s.totalKills} kills · ${s.upgradeSummary} · ${when}</span>`;
    if (kind === "save") {
      btn.addEventListener("click", () => {
        requestConfirm(state, "overwriteSave", s.slot);
        syncScreen();
      });
    } else {
      btn.addEventListener("click", () => doLoad(s.slot));
    }
    container.appendChild(btn);

    if (kind === "load") {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "menu-option";
      del.textContent = `Delete Slot ${s.slot + 1}`;
      del.addEventListener("click", () => {
        requestConfirm(state, "deleteSave", s.slot);
        syncScreen();
      });
      container.appendChild(del);
    }
  }
}

function renderConfirmMessage(): void {
  const msg = document.getElementById("confirm-message")!;
  const kind = state.pendingConfirm?.kind;
  msg.textContent = kind ? CONFIRM_MESSAGES[kind] : "";
}

function renderUpgradeCards(): void {
  const container = document.getElementById("upgrade-cards")!;
  container.innerHTML = "";
  state.upgradeOptions.forEach((kind, i) => {
    const level = state.upgrades[kind];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "upgrade-card";
    card.innerHTML = `
      <span class="upgrade-key">${i + 1}</span>
      <span class="upgrade-name">${UPGRADE_NAME[kind]}</span>
      <span class="upgrade-level">Level ${level} &rarr; ${level + 1} (max ${UPGRADE_MAX_LEVEL[kind]})</span>
      <span class="upgrade-description">${UPGRADE_DESCRIPTION[kind]}</span>
      <span class="upgrade-value">+${effectValue(kind, level)}</span>
    `;
    card.addEventListener("click", () => chooseUpgrade(kind));
    container.appendChild(card);
  });
}

function refreshTitleButtons(): void {
  const hasAny = listSlotSummaries().some((s) => !s.empty);
  (document.getElementById("btn-continue") as HTMLButtonElement).disabled = !hasAny;
}

/** Toggles [hidden] on exactly one menu overlay, keyed off state.screen, and
 * rebuilds any screen's dynamic content on entry. Cheap to call every frame
 * (only acts on an actual screen change) and also called directly after every
 * menu action so input isolation/focus land on the same tick as the click. */
function syncScreen(): void {
  if (state.screen === prevScreen) return;
  const activeId = SCREEN_TO_OVERLAY[state.screen] ?? null;
  for (const id of MENU_OVERLAY_IDS) setOverlayVisible(id, id === activeId);

  if (state.screen === "saveMenu") renderSlotList("save");
  else if (state.screen === "loadMenu") renderSlotList("load");
  else if (state.screen === "confirm") renderConfirmMessage();
  else if (state.screen === "upgrade") renderUpgradeCards();
  else if (state.screen === "title") refreshTitleButtons();

  if (activeId) {
    const overlay = document.getElementById(activeId);
    overlay?.querySelector<HTMLElement>(".menu-option:not(:disabled), .upgrade-card:not(:disabled)")?.focus();
  }
  prevScreen = state.screen;
}

function startFreshRun(): void {
  state = createInitialState();
  state.screen = "playing";
  resetHudCache();
  resetInputState(input);
  prevScreen = null;
  syncScreen();
}

function returnToTitle(): void {
  state = createTitleState();
  resetHudCache();
  resetInputState(input);
  prevScreen = null;
  syncScreen();
}

function doSave(slot: number): void {
  const ok = saveToSlot(state, slot);
  // renderSlotList rebuilds the slot buttons from the now-updated storage (so
  // the just-saved slot shows its new summary) but it also clears #save-status
  // itself — it must run before the status message is set, not after, or the
  // message is wiped the instant it's written.
  renderSlotList("save");
  const status = document.getElementById("save-status")!;
  status.textContent = ok ? `Saved to Slot ${slot + 1}.` : "Save failed — storage unavailable.";
}

function doLoad(slot: number): void {
  const loaded = loadFromSlot(slot);
  if (!loaded) {
    const status = document.getElementById("load-status")!;
    status.textContent = "Load failed — slot unavailable or corrupt.";
    return;
  }
  state = loaded;
  resetHudCache();
  resetInputState(input);
  prevScreen = null;
  syncScreen();
}

function chooseUpgrade(kind: UpgradeKind): void {
  if (state.screen !== "upgrade") return;
  applyUpgradeChoice(state, kind);
  enterCountdown(state);
  syncScreen();
}

// ---------------------------------------------------------------------------
// Button wiring
// ---------------------------------------------------------------------------

document.getElementById("btn-new-game")!.addEventListener("click", startFreshRun);
document.getElementById("btn-continue")!.addEventListener("click", () => {
  const saved = listSlotSummaries().filter((s) => !s.empty);
  if (saved.length === 0) return;
  const latest = saved.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
  doLoad(latest.slot);
});
document.getElementById("btn-load-game")!.addEventListener("click", () => {
  openSubMenu(state, "loadMenu");
  syncScreen();
});
document.getElementById("btn-how-to-play")!.addEventListener("click", () => {
  openSubMenu(state, "howToPlay");
  syncScreen();
});
document.getElementById("btn-end-game")!.addEventListener("click", () => {
  requestConfirm(state, "endGame");
  syncScreen();
});
document.getElementById("btn-how-to-play-back")!.addEventListener("click", () => {
  closeSubMenu(state);
  syncScreen();
});

document.getElementById("btn-resume")!.addEventListener("click", () => {
  resumeFromPause(state);
  syncScreen();
});
document.getElementById("btn-save-game")!.addEventListener("click", () => {
  openSubMenu(state, "saveMenu");
  syncScreen();
});
document.getElementById("btn-load-game-pause")!.addEventListener("click", () => {
  openSubMenu(state, "loadMenu");
  syncScreen();
});
document.getElementById("btn-restart-run")!.addEventListener("click", () => {
  requestConfirm(state, "restartRun");
  syncScreen();
});
document.getElementById("btn-end-run")!.addEventListener("click", () => {
  requestConfirm(state, "endRun");
  syncScreen();
});
document.getElementById("btn-return-menu")!.addEventListener("click", () => {
  requestConfirm(state, "returnToMenu");
  syncScreen();
});

document.getElementById("btn-save-back")!.addEventListener("click", () => {
  closeSubMenu(state);
  syncScreen();
});
document.getElementById("btn-load-back")!.addEventListener("click", () => {
  closeSubMenu(state);
  syncScreen();
});

document.getElementById("btn-confirm-yes")!.addEventListener("click", () => {
  const pending = state.pendingConfirm;
  if (!pending) return;
  const slot = pending.slot;

  switch (pending.kind) {
    case "overwriteSave":
      clearConfirm(state);
      state.screen = "saveMenu";
      if (slot !== undefined) doSave(slot);
      break;
    case "deleteSave":
      clearConfirm(state);
      state.screen = "loadMenu";
      if (slot !== undefined) deleteSlot(slot);
      renderSlotList("load");
      break;
    case "endRun":
      clearConfirm(state);
      endRunNow(state);
      break;
    case "restartRun":
      startFreshRun();
      return; // startFreshRun already replaces state and calls syncScreen
    case "returnToMenu":
    case "endGame":
      returnToTitle();
      return; // returnToTitle already replaces state and calls syncScreen
  }
  prevScreen = null;
  syncScreen();
});
document.getElementById("btn-confirm-no")!.addEventListener("click", () => {
  cancelConfirm(state);
  syncScreen();
});

document.getElementById("btn-play-again")!.addEventListener("click", startFreshRun);
document.getElementById("btn-results-menu")!.addEventListener("click", returnToTitle);

// ---------------------------------------------------------------------------
// Menu-only keyboard: pause/back (Escape, P), upgrade shortcuts (1/2/3), and
// arrow/A-D focus cycling among the visible overlay's options (Section 6/10).
// Movement/fire keys never reach here — attachInput's own isGameActive() gate
// already keeps those out of the InputState while any of these screens show.
// ---------------------------------------------------------------------------

function currentOverlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".menu-overlay:not([hidden])");
}

function focusableOptions(overlay: HTMLElement): HTMLElement[] {
  return Array.from(overlay.querySelectorAll<HTMLElement>(".menu-option:not(:disabled), .upgrade-card:not(:disabled)"));
}

function cycleMenuFocus(dir: 1 | -1): void {
  const overlay = currentOverlay();
  if (!overlay) return;
  const options = focusableOptions(overlay);
  if (options.length === 0) return;
  const activeIndex = options.indexOf(document.activeElement as HTMLElement);
  const nextIndex = ((activeIndex < 0 ? -1 : activeIndex) + dir + options.length) % options.length;
  options.forEach((el, i) => el.classList.toggle("is-selected", i === nextIndex));
  options[nextIndex]!.focus();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (isGameActive()) {
      openPauseMenu(state, input);
      syncScreen();
      e.preventDefault();
      return;
    }
    if (e.code !== "Escape") return; // KeyP only ever opens the pause menu, never closes another one
    switch (state.screen) {
      case "paused":
        resumeFromPause(state);
        break;
      case "saveMenu":
      case "loadMenu":
      case "howToPlay":
        closeSubMenu(state);
        break;
      case "confirm":
        cancelConfirm(state);
        break;
      default:
        return;
    }
    syncScreen();
    e.preventDefault();
    return;
  }

  if (isGameActive()) return; // every remaining shortcut below is menu-only

  if (state.screen === "upgrade" && (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3")) {
    const idx = Number(e.code.slice(-1)) - 1;
    const kind = state.upgradeOptions[idx];
    if (kind) {
      chooseUpgrade(kind);
      e.preventDefault();
    }
    return;
  }

  if (e.code === "ArrowUp" || e.code === "ArrowLeft" || e.code === "KeyA") {
    cycleMenuFocus(-1);
    e.preventDefault();
  } else if (e.code === "ArrowDown" || e.code === "ArrowRight" || e.code === "KeyD") {
    cycleMenuFocus(1);
    e.preventDefault();
  }
});

syncScreen();

// ---------------------------------------------------------------------------
// Frame clock
// ---------------------------------------------------------------------------

let lastTime: number | null = null;
let backgrounded = false;

function onVisibilityChange(): void {
  backgrounded = document.hidden;
  if (!backgrounded) lastTime = null; // drop the elapsed background time instead of feeding it as one huge dt
}
document.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("blur", () => {
  backgrounded = true;
});
window.addEventListener("focus", () => {
  backgrounded = false;
  lastTime = null;
});

function frame(time: number): void {
  requestAnimationFrame(frame);
  if (backgrounded) return;

  if (lastTime === null) lastTime = time;
  const dt = Math.min(MAX_DT, (time - lastTime) / 1000);
  lastTime = time;

  state = update(state, input, dt);
  audioSnapshot = playEventSounds(audioSnapshot, state);
  renderFrame(ctx, state);
  updateHud(state, hudRefs);
  syncScreen();
}

requestAnimationFrame(frame);

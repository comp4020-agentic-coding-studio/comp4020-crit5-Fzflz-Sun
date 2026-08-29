// Pure screen-transition logic for every non-gameplay AppScreen. Kept free of
// the DOM entirely so it's vitest-testable — main.ts is the only place that
// touches overlays/localStorage, calling into these functions for the "what
// should happen" half of every menu action.
import type { ConfirmKind, GameState, InputState } from "./types";
import { resetInputState } from "./input";

/** Opens the pause menu from "playing"/"countdown" — a no-op from anywhere
 * else (e.g. a stray touch-pause tap while a menu is already open). */
export function openPauseMenu(state: GameState, input: InputState): void {
  if (state.screen !== "playing" && state.screen !== "countdown") return;
  state.menuReturnScreen = state.screen;
  state.screen = "paused";
  resetInputState(input);
}

/** Resumes gameplay from the pause menu (or any submenu reached from it) at
 * whichever screen was paused from — "playing" or mid-"countdown". */
export function resumeFromPause(state: GameState): void {
  state.screen = state.menuReturnScreen ?? "playing";
  state.menuReturnScreen = null;
}

/** Opens a submenu (save/load/how-to-play) remembering the screen to return
 * to on "Back" — the title screen and the pause menu both open these. */
export function openSubMenu(state: GameState, screen: "saveMenu" | "loadMenu" | "howToPlay"): void {
  state.menuReturnScreen = state.screen;
  state.screen = screen;
}

/** "Back"/"Cancel" out of a submenu, returning to whichever screen opened it. */
export function closeSubMenu(state: GameState): void {
  state.screen = state.menuReturnScreen ?? "title";
  state.menuReturnScreen = null;
}

/** Arms a confirmation dialog for a destructive action — never resolved by a
 * native confirm()/alert(), always a fresh AppScreen the player must actively
 * dismiss or accept via the DOM confirm overlay. */
export function requestConfirm(state: GameState, kind: ConfirmKind, slot?: number): void {
  state.pendingConfirm = { kind, slot };
  state.menuReturnScreen = state.screen;
  state.screen = "confirm";
}

/** Declines the pending confirmation, returning to whatever screen requested
 * it without performing the destructive action. */
export function cancelConfirm(state: GameState): void {
  state.screen = state.menuReturnScreen ?? "title";
  state.menuReturnScreen = null;
  state.pendingConfirm = null;
}

/** Clears the pending confirmation once the caller has carried out the
 * accepted action and decided the resulting screen itself — every confirm
 * kind lands somewhere different (title, a fresh run, a reloaded save), so
 * the screen transition itself is the caller's responsibility, not this
 * function's. */
export function clearConfirm(state: GameState): void {
  state.pendingConfirm = null;
  state.menuReturnScreen = null;
}

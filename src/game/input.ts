// Unifies keyboard, mouse, and touch into one InputState. Desktop and mobile
// controls are live at the same time — nothing here detects "which device"
// and switches modes, so a device with both just gets both.
import type { InputState } from "./types";

export function createInputState(): InputState {
  return { forward: false, backward: false, turnLeft: false, turnRight: false, fire: false, restart: false };
}

const FORWARD_KEYS = new Set(["KeyW", "ArrowUp"]);
const BACKWARD_KEYS = new Set(["KeyS", "ArrowDown"]);
const TURN_LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
const TURN_RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
const FIRE_KEYS = new Set(["Space", "ControlLeft", "ControlRight"]);
const RESTART_KEYS = new Set(["Enter", "KeyR"]);

// A press-and-release faster than one animation frame (a quick tap, or a
// fast automated click) can otherwise set a flag true then false before the
// game loop ever reads it, silently dropping the shot/restart. Releasing on
// the next frame instead of synchronously guarantees at least one frame sees
// it as pressed.
function releaseNextFrame(set: (down: boolean) => void): void {
  requestAnimationFrame(() => set(false));
}

function setFromKey(input: InputState, code: string, down: boolean): void {
  if (FORWARD_KEYS.has(code)) input.forward = down;
  else if (BACKWARD_KEYS.has(code)) input.backward = down;
  else if (TURN_LEFT_KEYS.has(code)) input.turnLeft = down;
  else if (TURN_RIGHT_KEYS.has(code)) input.turnRight = down;
  else if (FIRE_KEYS.has(code)) {
    if (down) input.fire = true;
    else releaseNextFrame((v) => (input.fire = v));
  } else if (RESTART_KEYS.has(code)) {
    if (down) input.restart = true;
    else releaseNextFrame((v) => (input.restart = v));
  }
}

export interface TouchTargets {
  canvas: HTMLElement;
  forward?: HTMLElement | null;
  backward?: HTMLElement | null;
  turnLeft?: HTMLElement | null;
  turnRight?: HTMLElement | null;
  fire?: HTMLElement | null;
  retry?: HTMLElement | null;
}

/** Wires up keyboard, canvas click-to-fire, and the touch buttons. Returns a
 * cleanup function that removes every listener it added. */
export function attachInput(input: InputState, targets: TouchTargets): () => void {
  const cleanups: Array<() => void> = [];

  const onKeyDown = (e: KeyboardEvent) => {
    if (FORWARD_KEYS.has(e.code) || BACKWARD_KEYS.has(e.code) || TURN_LEFT_KEYS.has(e.code) || TURN_RIGHT_KEYS.has(e.code) || FIRE_KEYS.has(e.code)) {
      e.preventDefault();
    }
    setFromKey(input, e.code, true);
  };
  const onKeyUp = (e: KeyboardEvent) => setFromKey(input, e.code, false);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  cleanups.push(() => window.removeEventListener("keydown", onKeyDown));
  cleanups.push(() => window.removeEventListener("keyup", onKeyUp));

  const bindHold = (el: HTMLElement | null | undefined, set: (down: boolean) => void, deferRelease = false) => {
    if (!el) return;
    const down = (e: Event) => {
      e.preventDefault();
      set(true);
    };
    const up = (e: Event) => {
      e.preventDefault();
      if (deferRelease) releaseNextFrame(set);
      else set(false);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    cleanups.push(() => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointerleave", up);
      el.removeEventListener("pointercancel", up);
    });
  };

  bindHold(targets.forward, (v) => (input.forward = v));
  bindHold(targets.backward, (v) => (input.backward = v));
  bindHold(targets.turnLeft, (v) => (input.turnLeft = v));
  bindHold(targets.turnRight, (v) => (input.turnRight = v));
  bindHold(targets.fire, (v) => (input.fire = v), true);
  bindHold(targets.canvas, (v) => (input.fire = v), true);
  bindHold(targets.retry, (v) => (input.restart = v), true);

  return () => cleanups.forEach((fn) => fn());
}

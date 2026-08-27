// Bootstraps the game: wires input to the update loop to the renderer. Kept
// deliberately thin — every rule lives in src/game/*, this file only drives
// the frame clock and DOM plumbing.
import { createInitialState, update } from "./src/game/state";
import { createInputState, attachInput } from "./src/game/input";
import { renderFrame } from "./src/game/renderer";
import { getHudRefs, updateHud } from "./src/game/hud";
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, MAX_DT } from "./src/game/constants";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

const gameStage = document.querySelector<HTMLElement>("#game-stage")!;
const hud = document.querySelector<HTMLElement>("#hud")!;
const touchControls = document.querySelector<HTMLElement>("#touch-controls")!;

let state = createInitialState();
const input = createInputState();
const hudRefs = getHudRefs(document);

attachInput(input, {
  canvas,
  forward: document.querySelector("#btn-forward"),
  backward: document.querySelector("#btn-backward"),
  turnLeft: document.querySelector("#btn-turn-left"),
  turnRight: document.querySelector("#btn-turn-right"),
  fire: document.querySelector("#btn-fire"),
  retry: document.querySelector("#btn-retry"),
});

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

let lastTime: number | null = null;
let paused = false;

function onVisibilityChange(): void {
  paused = document.hidden;
  if (!paused) lastTime = null; // drop the elapsed background time instead of feeding it as one huge dt
}
document.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("blur", () => {
  paused = true;
});
window.addEventListener("focus", () => {
  paused = false;
  lastTime = null;
});

function frame(time: number): void {
  requestAnimationFrame(frame);
  if (paused) return;

  if (lastTime === null) lastTime = time;
  const dt = Math.min(MAX_DT, (time - lastTime) / 1000);
  lastTime = time;

  state = update(state, input, dt);
  renderFrame(ctx, state);
  updateHud(state, hudRefs);
}

requestAnimationFrame(frame);

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

function resizeCanvas(): void {
  const scale = Math.min(window.innerWidth / INTERNAL_WIDTH, window.innerHeight / INTERNAL_HEIGHT);
  canvas.style.width = `${INTERNAL_WIDTH * scale}px`;
  canvas.style.height = `${INTERNAL_HEIGHT * scale}px`;
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

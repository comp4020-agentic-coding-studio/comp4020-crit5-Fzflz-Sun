// Physical facing is continuous; the rendered/aimed direction is snapped to a
// fixed number of steps. That mismatch is the point — it's what gives the
// early shareware-FPS feel of slight frame-skip when turning, and it keeps
// what you see lined up with what a shot actually fires along (no crosshair).
import { RENDER_ANGLE_STEPS } from "./constants";

const TAU = Math.PI * 2;

export function quantizeAngle(angle: number, steps: number = RENDER_ANGLE_STEPS): number {
  const normalized = ((angle % TAU) + TAU) % TAU;
  const step = TAU / steps;
  return Math.round(normalized / step) * step;
}

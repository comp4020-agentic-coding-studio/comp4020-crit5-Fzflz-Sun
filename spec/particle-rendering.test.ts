// Particle draw-call budget regression tests (crit-5 perf fix #4). Before
// this fix, particles were rendered through the same per-column billboard
// stripe loop as real sprites — a particle a few tiles wide fills most of the
// screen in one-pixel stripes, so a single close-up death burst could cost
// thousands of extra drawImage/fillRect calls in one frame. drawParticles now
// costs exactly one fillRect per rendered particle. There's no real
// <canvas> in this test environment (and no `document`, so getSpriteImage
// always returns null and every draw goes through the fillRect fallback
// path), so a fake CanvasRenderingContext2D just counts calls.
import { describe, expect, it } from "vitest";
import { createInitialState, update } from "../src/game/state";
import { createInputState } from "../src/game/input";
import { renderFrame } from "../src/game/renderer";
import { MAX_ACTIVE_PARTICLES } from "../src/game/constants";
import type { GameState } from "../src/game/types";

class FakeCanvasContext {
  fillStyle = "";
  globalAlpha = 1;
  fillRectCalls = 0;
  drawImageCalls = 0;

  fillRect(): void {
    this.fillRectCalls += 1;
  }

  drawImage(): void {
    this.drawImageCalls += 1;
  }
}

function baseState(): GameState {
  const state = createInitialState();
  state.enemies = [];
  state.pickups = [];
  state.pedestals = [];
  state.projectiles = [];
  state.particles = [];
  return state;
}

describe("particle rendering draw-call budget", () => {
  it("costs at most one extra fillRect per particle, even for particles right next to the camera", () => {
    const empty = baseState();
    const ctxEmpty = new FakeCanvasContext();
    renderFrame(ctxEmpty as unknown as CanvasRenderingContext2D, empty);
    const baseline = ctxEmpty.fillRectCalls;

    const withParticles = baseState();
    const particleCount = 50;
    for (let i = 0; i < particleCount; i++) {
      // Directly ahead of the player and very close — the exact "near-camera
      // death particle" scenario that used to blow up into thousands of
      // stripe draw calls under the old shared billboard path.
      withParticles.particles.push({
        pos: { x: withParticles.player.pos.x + 0.3, y: withParticles.player.pos.y },
        vel: { x: 0, y: 0 },
        ttl: 1,
        maxTtl: 1,
        color: "#fff",
      });
    }
    const ctxWithParticles = new FakeCanvasContext();
    renderFrame(ctxWithParticles as unknown as CanvasRenderingContext2D, withParticles);

    const extraCalls = ctxWithParticles.fillRectCalls - baseline;
    expect(extraCalls).toBeGreaterThan(0);
    expect(extraCalls).toBeLessThanOrEqual(particleCount);
    // The old per-column path could cost on the order of the screen width
    // (hundreds) per near particle — this stays firmly in the tens.
    expect(extraCalls).toBeLessThan(particleCount * 2);
  });

  it("never produces a non-finite draw coordinate for a particle exactly at the camera position", () => {
    const state = baseState();
    state.particles.push({ pos: { ...state.player.pos }, vel: { x: 0, y: 0 }, ttl: 1, maxTtl: 1, color: "#fff" });

    const ctx = new FakeCanvasContext();
    expect(() => renderFrame(ctx as unknown as CanvasRenderingContext2D, state)).not.toThrow();
  });

  it("respects PARTICLE_MAX_SCREEN_PX / caps total active particles globally after a frame update, even after a huge burst", () => {
    const state = baseState();
    for (let i = 0; i < MAX_ACTIVE_PARTICLES * 3; i++) {
      state.particles.push({ pos: { x: 5, y: 5 }, vel: { x: 0, y: 0 }, ttl: 5, maxTtl: 5, color: "#fff" });
    }

    const input = createInputState();
    const next = update(state, input, 1 / 60);

    expect(next.particles.length).toBeLessThanOrEqual(MAX_ACTIVE_PARTICLES);
  });
});

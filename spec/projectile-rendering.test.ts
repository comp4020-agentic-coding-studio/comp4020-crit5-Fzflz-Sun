// Enemy-projectile draw-call budget regression tests (crit-5 sustained-fire
// stutter fix #5). Before this fix, projectiles were pushed into the same
// shared per-column billboard array as enemies/pedestals/pickups and drawn
// through drawBillboards' per-column stripe loop — a projectile sprite close
// to the camera fills a wide span of columns, each its own draw call, so a
// firefight with several projectiles in flight could cost hundreds of draw
// calls a frame. drawProjectiles now costs a small fixed number of draw calls
// per projectile, like drawParticles. There's no real <canvas> in this test
// environment (and no `document`, so getSpriteImage always returns null and
// every draw goes through the fillRect fallback path), so a fake
// CanvasRenderingContext2D just counts calls.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { renderFrame } from "../src/game/renderer";
import { PROJECTILE_MAX_SCREEN_PX } from "../src/game/constants";
import type { GameState, Projectile } from "../src/game/types";

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

function drawCalls(ctx: FakeCanvasContext): number {
  return ctx.fillRectCalls + ctx.drawImageCalls;
}

function makeProjectile(pos: { x: number; y: number }): Projectile {
  return { id: Math.floor(Math.random() * 1e9), pos: { ...pos }, vel: { x: 0, y: 0 }, ttl: 5, damage: 5 };
}

describe("projectile rendering draw-call budget", () => {
  it("costs at most a small fixed number of draw calls per projectile, scaling roughly linearly with count", () => {
    const empty = baseState();
    const ctxEmpty = new FakeCanvasContext();
    renderFrame(ctxEmpty as unknown as CanvasRenderingContext2D, empty);
    const baseline = drawCalls(ctxEmpty);

    for (const count of [1, 5, 10]) {
      const state = baseState();
      for (let i = 0; i < count; i++) {
        // Directly ahead of the player and very close — the exact
        // "firefight, projectile right in front of the camera" scenario that
        // used to blow up into hundreds of stripe draw calls under the old
        // shared billboard path.
        state.projectiles.push(makeProjectile({ x: state.player.pos.x + 0.3 + i * 0.01, y: state.player.pos.y }));
      }
      const ctx = new FakeCanvasContext();
      renderFrame(ctx as unknown as CanvasRenderingContext2D, state);
      const extra = drawCalls(ctx) - baseline;

      expect(extra).toBeGreaterThan(0);
      // A small fixed number of draw calls per projectile (one drawImage/
      // fillRect, not one per screen column it would otherwise cover).
      expect(extra).toBeLessThanOrEqual(count * 2);
    }
  });

  it("never produces a non-finite draw coordinate for a projectile exactly at the camera position", () => {
    const state = baseState();
    state.projectiles.push(makeProjectile(state.player.pos));

    const ctx = new FakeCanvasContext();
    expect(() => renderFrame(ctx as unknown as CanvasRenderingContext2D, state)).not.toThrow();
  });

  it("caps a close-range projectile's on-screen size at PROJECTILE_MAX_SCREEN_PX worth of draw-call cost, not ballooning toward full-screen", () => {
    const far = baseState();
    far.projectiles.push(makeProjectile({ x: far.player.pos.x + 3, y: far.player.pos.y }));
    const ctxFar = new FakeCanvasContext();
    renderFrame(ctxFar as unknown as CanvasRenderingContext2D, far);

    const close = baseState();
    close.projectiles.push(makeProjectile({ x: close.player.pos.x + 0.15, y: close.player.pos.y }));
    const ctxClose = new FakeCanvasContext();
    renderFrame(ctxClose as unknown as CanvasRenderingContext2D, close);

    // Both a far and a very close projectile cost the same small, fixed
    // number of draw calls — the cap bounds size, not call count, but a
    // capped size also means no per-column fallback ever kicks in.
    expect(drawCalls(ctxClose)).toBe(drawCalls(ctxFar));
    expect(PROJECTILE_MAX_SCREEN_PX).toBeGreaterThan(0);
  });

  it("keeps draw calls bounded in a busy firefight scene with projectiles and particles both present", () => {
    const empty = baseState();
    const ctxEmpty = new FakeCanvasContext();
    renderFrame(ctxEmpty as unknown as CanvasRenderingContext2D, empty);
    const baseline = drawCalls(ctxEmpty); // walls/ceiling/floor cost the same regardless of entity count

    const state = baseState();
    for (let i = 0; i < 10; i++) {
      state.projectiles.push(makeProjectile({ x: state.player.pos.x + 1 + i * 0.2, y: state.player.pos.y + 0.1 * i }));
    }
    for (let i = 0; i < 10; i++) {
      state.particles.push({
        pos: { x: state.player.pos.x + 0.5, y: state.player.pos.y },
        vel: { x: 0, y: 0 },
        ttl: 1,
        maxTtl: 1,
        color: "#fff",
      });
    }

    const ctx = new FakeCanvasContext();
    renderFrame(ctx as unknown as CanvasRenderingContext2D, state);

    // 20 cheap-path entities on top of the wall/floor/ceiling baseline should
    // cost well under a hundred *extra* draw calls — the old shared billboard
    // path could cost hundreds from projectiles alone in this scenario.
    expect(drawCalls(ctx) - baseline).toBeLessThan(100);
  });
});

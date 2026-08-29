// Independent weapon-animation timer regression tests (crit-5 sustained-fire
// stutter fix #4). Before this fix, drawWeapon derived its frame from
// `FIRE_COOLDOWN - player.fireCooldown` — but Rapid sets fireCooldown to a
// shorter value than FIRE_COOLDOWN, so under Rapid the computed "elapsed
// since fire" jumped straight past the early frames. fireAnimationTimer is
// now a separate field, always counts down from the same
// WEAPON_FIRE_ANIM_DURATION regardless of fire rate, and is unaffected by
// hit-stop.
import { describe, expect, it } from "vitest";
import { createInitialState, update } from "../src/game/state";
import { createInputState } from "../src/game/input";
import { handlePlayerFire } from "../src/game/combat";
import { computeWeaponFrame } from "../src/game/renderer";
import { HITSTOP_KILL_NORMAL, WEAPON_FIRE_ANIM_DURATION } from "../src/game/constants";

describe("computeWeaponFrame", () => {
  it("is idle frame 0 when no shot is in flight", () => {
    expect(computeWeaponFrame(0)).toEqual({ slot: "weapon.idle", frame: 0 });
  });

  it("starts at fire-0 the instant a shot is fired, and ends at idle", () => {
    expect(computeWeaponFrame(WEAPON_FIRE_ANIM_DURATION).frame).toBe(0);
    expect(computeWeaponFrame(WEAPON_FIRE_ANIM_DURATION).slot).toBe("weapon.fire");
  });

  it("plays all four frames in order as the timer counts down to zero", () => {
    const steps = 40;
    const frames: number[] = [];
    for (let i = steps; i >= 0; i--) {
      const timer = (WEAPON_FIRE_ANIM_DURATION * i) / steps;
      const result = timer <= 0 ? computeWeaponFrame(0) : computeWeaponFrame(timer);
      frames.push(result.frame);
    }

    expect(frames[0]).toBe(0);
    expect(frames[frames.length - 1]).toBe(0); // back to idle (computeWeaponFrame(0))
    expect(Math.max(...frames)).toBe(3);
    // Never jumps backwards mid-animation (excluding the final idle reset).
    const firingFrames = frames.slice(0, -1);
    for (let i = 1; i < firingFrames.length; i++) {
      expect(firingFrames[i]!).toBeGreaterThanOrEqual(firingFrames[i - 1]!);
    }
  });

  it("never sticks on one frame while the timer keeps decreasing", () => {
    const a = computeWeaponFrame(WEAPON_FIRE_ANIM_DURATION * 0.9);
    const b = computeWeaponFrame(WEAPON_FIRE_ANIM_DURATION * 0.1);
    expect(b.frame).toBeGreaterThan(a.frame);
  });
});

describe("fireAnimationTimer state behavior", () => {
  it("normal fire's first computed frame is fire-0, same as Rapid's", () => {
    const normal = createInitialState();
    handlePlayerFire(normal, 0);
    const normalFrame = computeWeaponFrame(normal.player.fireAnimationTimer);

    const rapid = createInitialState();
    rapid.upgrades.rapid = 1;
    handlePlayerFire(rapid, 0);
    const rapidFrame = computeWeaponFrame(rapid.player.fireAnimationTimer);

    expect(normalFrame).toEqual({ slot: "weapon.fire", frame: 0 });
    expect(rapidFrame).toEqual({ slot: "weapon.fire", frame: 0 });
    // Rapid's shorter fireCooldown never changes the animation timer itself.
    expect(rapid.player.fireAnimationTimer).toBe(normal.player.fireAnimationTimer);
  });

  it("does not restart the animation on a fire-held-with-no-ammo frame", () => {
    const state = createInitialState();
    state.player.ammo = 0;
    state.player.fireAnimationTimer = 0.01;
    handlePlayerFire(state, 0);
    expect(state.player.fireAnimationTimer).toBe(0.01);
  });

  it("decrements every frame independent of hit-stop", () => {
    const state = createInitialState();
    handlePlayerFire(state, 0);
    const afterFire = state.player.fireAnimationTimer;
    state.hitStopTimer = HITSTOP_KILL_NORMAL;

    const next = update(state, createInputState(), 1 / 60);
    expect(next.player.fireAnimationTimer).toBeLessThan(afterFire);
  });

  it("starts at zero on a brand-new run", () => {
    // Restart is a whole-state replacement (main.ts hands back a fresh
    // createInitialState()), not an update()-driven input flag — so the only
    // thing worth asserting here is that a fresh state never carries over a
    // stale animation timer from whatever came before it.
    const fresh = createInitialState();
    expect(fresh.player.fireAnimationTimer).toBe(0);
  });
});

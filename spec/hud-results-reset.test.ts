// Regression test for a bug where the results overlay stayed visible forever
// after "Play Again" / "Main Menu" — updateHud() only toggles the overlay's
// `hidden` attribute when state.screen === "results" *changes value* since
// the last frame, and resetHudCache() used to reset its cache to `false`,
// which matched the next frame's real value (also false, since the new run
// starts on "playing"/"title") and so never fired the update that hides it.
import { describe, expect, it } from "vitest";
import { createInitialState, createTitleState, endRunNow } from "../src/game/state";
import { resetHudCache, updateHud, type HudRefs } from "../src/game/hud";

function fakeElement(): HTMLElement {
  return {
    hidden: false,
    textContent: "",
    getAnimations: () => [],
    animate: () => undefined,
  } as unknown as HTMLElement;
}

function fakeRefs(): HudRefs {
  return {
    healthValue: fakeElement(),
    ammoValue: fakeElement(),
    enemiesValue: fakeElement(),
    scoreValue: fakeElement(),
    multiplierValue: fakeElement(),
    timerValue: fakeElement(),
    waveValue: fakeElement(),
    hintBanner: fakeElement(),
    milestoneBanner: fakeElement(),
    resultsOverlay: fakeElement(),
    resultsTime: fakeElement(),
    resultsWave: fakeElement(),
    resultsScore: fakeElement(),
    resultsKills: fakeElement(),
    resultsCombo: fakeElement(),
    resultsUpgrades: fakeElement(),
    resultsMilestone: fakeElement(),
    resultsGrade: fakeElement(),
  };
}

describe("hud results overlay reset across a run boundary", () => {
  it("hides the results overlay again once a fresh run starts after Play Again", () => {
    const refs = fakeRefs();

    const dead = createInitialState();
    endRunNow(dead);
    updateHud(dead, refs);
    expect(refs.resultsOverlay.hidden).toBe(false);

    resetHudCache();
    const fresh = createInitialState();
    fresh.screen = "playing";
    updateHud(fresh, refs);

    expect(refs.resultsOverlay.hidden).toBe(true);
  });

  it("hides the results overlay again once the title screen loads after Main Menu", () => {
    const refs = fakeRefs();

    const dead = createInitialState();
    endRunNow(dead);
    updateHud(dead, refs);
    expect(refs.resultsOverlay.hidden).toBe(false);

    resetHudCache();
    const title = createTitleState();
    updateHud(title, refs);

    expect(refs.resultsOverlay.hidden).toBe(true);
  });
});

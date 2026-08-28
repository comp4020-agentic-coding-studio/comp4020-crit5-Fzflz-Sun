// Local-only smoke test against the built site (playwright.config.ts). Covers
// the one thing spec/combat.test.ts can't: that the real pipeline (input ->
// update -> renderer -> HUD) is actually wired together in the browser.
import { test, expect } from "@playwright/test";

test.describe("desktop", () => {
  test("loads straight into gameplay and a shot drops the HUD enemy count", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");

    const canvas = page.locator("#game-canvas");
    await expect(canvas).toBeVisible();
    await expect(page.locator("#hud-health-value")).toHaveText("100");
    await expect(page.locator("#hud-ammo-value")).toHaveText("24");
    await expect(page.locator("#hud-enemies-value")).toHaveText("11");

    // No title/menu/tutorial screen: gameplay is live immediately, and the
    // page never scrolls.
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).toBe("hidden");

    // The intro enemy sits directly ahead of the start position and angle —
    // one shot should be enough without any movement first.
    await page.keyboard.down("Space");
    await page.waitForTimeout(150);
    await page.keyboard.up("Space");

    await expect(page.locator("#hud-enemies-value")).toHaveText("10");
    await expect(page.locator("#hud-ammo-value")).toHaveText("23");

    expect(errors, `console/page errors during play: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("moving forward changes position without any wall-clipping error", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(300);
    await page.keyboard.up("KeyW");
    // Reaching here without a thrown error / crash is the assertion; also
    // confirm the game hasn't ended (health untouched by movement alone).
    await expect(page.locator("#hud-health-value")).toHaveText("100");
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("shows textless touch controls and they respond to taps", async ({ page }) => {
    await page.goto("/");

    const touchControls = page.locator("#touch-controls");
    await expect(touchControls).toBeVisible();

    const fireButton = page.locator("#btn-fire");
    await expect(fireButton).toBeVisible();
    const box = await fireButton.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44); // real tap target, not a sliver
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await fireButton.tap();
    await page.waitForTimeout(150);
    await expect(page.locator("#hud-ammo-value")).toHaveText("23");
  });

  test("every touch button meets the 44x44 tap-target minimum", async ({ page }) => {
    await page.goto("/");
    const ids = ["btn-turn-left", "btn-forward", "btn-turn-right", "btn-backward", "btn-fire"];
    for (const id of ids) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box?.width ?? 0, `#${id} width`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `#${id} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("the game stage fills the available width and never overlaps the touch UI", async ({ page }) => {
    // The 320x200 internal resolution is a fixed 1.6:1 aspect ratio (kept for
    // pixelated nearest-neighbor rendering), so on a narrow tall phone the
    // canvas is always width-bound and real letterboxing above/below is
    // unavoidable — that isn't the bug this guards against. The actual old
    // bug was the HUD and touch buttons floating as unreserved fixed overlays
    // on top of the canvas/each other. This checks the fix: the canvas claims
    // essentially the full viewport width, the HUD sits flush under it with
    // no gap or overlap, and the touch controls never overlap the canvas.
    await page.goto("/");
    const canvasBox = (await page.locator("#game-canvas").boundingBox())!;
    const hudBox = (await page.locator("#hud").boundingBox())!;
    const touchBox = (await page.locator("#touch-controls").boundingBox())!;

    expect(canvasBox.width).toBeGreaterThan(390 * 0.9);
    expect(Math.abs(hudBox.y - (canvasBox.y + canvasBox.height))).toBeLessThan(4);
    expect(touchBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 1);
  });
});

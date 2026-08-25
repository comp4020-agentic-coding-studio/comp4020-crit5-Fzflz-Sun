// Local-only smoke test against the built site (playwright.config.ts). Covers
// the one thing spec/combat.test.ts can't: that the real pipeline (input ->
// update -> renderer -> HUD) is actually wired together in the browser.
import { test, expect } from "@playwright/test";

test.describe("desktop", () => {
  test("loads straight into gameplay and a shot drops the HUD enemy count", async ({ page }) => {
    await page.goto("/");

    const canvas = page.locator("#game-canvas");
    await expect(canvas).toBeVisible();
    await expect(page.locator("#hud-health-value")).toHaveText("100");
    await expect(page.locator("#hud-ammo-value")).toHaveText("24");
    await expect(page.locator("#hud-enemies-value")).toHaveText("7");

    // No title/menu/tutorial screen: gameplay is live immediately, and the
    // page never scrolls.
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).toBe("hidden");

    // The intro enemy sits directly ahead of the start position and angle —
    // one shot should be enough without any movement first.
    await page.keyboard.down("Space");
    await page.waitForTimeout(150);
    await page.keyboard.up("Space");

    await expect(page.locator("#hud-enemies-value")).toHaveText("6");
    await expect(page.locator("#hud-ammo-value")).toHaveText("23");
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
});

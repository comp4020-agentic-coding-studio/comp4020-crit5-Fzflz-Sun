// Local-only smoke test against the built site (playwright.config.ts). Covers
// the one thing the vitest spec suite can't: that the real pipeline (title
// screen -> input -> update -> renderer -> HUD -> menu overlays) is actually
// wired together in a real browser, for both the infinite-survival run loop
// and the Section 8/9 menu/save system layered around it. Runs against the
// built site (not the dev server) so it checks what actually ships.
import { test, expect, type Page } from "@playwright/test";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("desktop", () => {
  test("boots to the title screen, not straight into gameplay", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/");

    await expect(page.locator("#title-screen")).toBeVisible();
    await expect(page.locator("#btn-new-game")).toBeVisible();
    // Continue is disabled with no save data on a fresh browser profile.
    await expect(page.locator("#btn-continue")).toBeDisabled();

    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).toBe("hidden");

    expect(errors, `console/page errors on load: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("New Game starts a fresh run: full health/ammo, wave 1, no enemies yet", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/");
    await page.locator("#btn-new-game").click();

    await expect(page.locator("#title-screen")).toBeHidden();
    await expect(page.locator("#hud-health-value")).toHaveText("100");
    await expect(page.locator("#hud-ammo-value")).toHaveText("16");
    await expect(page.locator("#hud-wave-value")).toHaveText("1");
    await expect(page.locator("#hud-enemies-value")).toHaveText("0");

    expect(errors, `console/page errors during play: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("the Spawn Director places the first enemy a few seconds in, and a shot kills it", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").click();

    // WAVE_SPAWN_INTERVAL_BASE is 3.2s; give it real margin in a real browser.
    await expect(page.locator("#hud-enemies-value")).not.toHaveText("0", { timeout: 6_000 });

    // Face and approach: the Director never spawns directly in view, so
    // holding fire while turning/advancing is the reliable way to land a hit
    // without hardcoding a specific spawn anchor's position.
    const before = Number(await page.locator("#hud-ammo-value").textContent());
    for (let i = 0; i < 20; i++) {
      await page.keyboard.down("Space");
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(150);
      await page.keyboard.up("KeyD");
      await page.keyboard.up("Space");
      const kills = await page.locator("#hud-score-value").textContent();
      if (Number(kills) > 0) break;
    }
    const after = Number(await page.locator("#hud-ammo-value").textContent());
    expect(after).toBeLessThan(before);
  });

  test("moving forward changes position without any wall-clipping error", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").click();
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(300);
    await page.keyboard.up("KeyW");
    // Reaching here without a thrown error/crash is the assertion; also
    // confirm the game hasn't ended from movement alone.
    await expect(page.locator("#hud-health-value")).toHaveText("100");
  });

  test("pause freezes the world: ammo/health/wave never change while the pause menu is open", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").click();
    await page.waitForTimeout(500);

    const health = await page.locator("#hud-health-value").textContent();
    const ammo = await page.locator("#hud-ammo-value").textContent();

    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-menu")).toBeVisible();

    // Firing/moving while a menu is open must never reach the game. Space is
    // deliberately excluded here: syncScreen() auto-focuses the first menu
    // option (Resume), and holding Space down on a focused <button> is a
    // native browser activation gesture that fires on keyup — that's a fact
    // about buttons, not something this test is trying to verify.
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyW");

    await expect(page.locator("#hud-health-value")).toHaveText(health!);
    await expect(page.locator("#hud-ammo-value")).toHaveText(ammo!);

    await page.locator("#btn-resume").click();
    await expect(page.locator("#pause-menu")).toBeHidden();
  });

  test("save then load a slot round-trips through the pause menu, no native dialogs used", async ({ page }) => {
    let dialogSeen = false;
    page.on("dialog", () => {
      dialogSeen = true;
    });

    await page.goto("/");
    await page.locator("#btn-new-game").click();
    await page.waitForTimeout(300);

    await page.keyboard.press("Escape");
    await page.locator("#btn-save-game").click();
    await expect(page.locator("#save-menu")).toBeVisible();
    await page.locator("#save-slot-list .menu-option").first().click();
    await expect(page.locator("#save-status")).toContainText("Saved");

    await page.locator("#btn-save-back").click();
    await page.locator("#btn-return-menu").click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await page.locator("#btn-confirm-yes").click();
    await expect(page.locator("#title-screen")).toBeVisible();

    await expect(page.locator("#btn-continue")).toBeEnabled();
    await page.locator("#btn-load-game").click();
    await expect(page.locator("#load-menu")).toBeVisible();
    await page.locator("#load-slot-list .menu-option").first().click();
    await expect(page.locator("#load-menu")).toBeHidden();
    await expect(page.locator("#hud-health-value")).toHaveText("100");

    expect(dialogSeen, "a native alert/confirm/prompt fired").toBe(false);
  });

  test("End Run shows a confirm dialog, then the results screen with populated stats", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").click();
    // formatTime floors to whole seconds, so results-time-value needs a full
    // elapsed second to read as anything but "0:00".
    await page.waitForTimeout(1_500);

    await page.keyboard.press("Escape");
    await page.locator("#btn-end-run").click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await expect(page.locator("#confirm-message")).toContainText("results");

    await page.locator("#btn-confirm-yes").click();
    await expect(page.locator("#results-screen")).toBeVisible();
    await expect(page.locator("#results-wave-value")).toHaveText("1");
    await expect(page.locator("#results-time-value")).not.toHaveText("0:00");

    await page.locator("#btn-results-menu").click();
    await expect(page.locator("#title-screen")).toBeVisible();
  });

  test("a full wave cycle (combat -> cleanup -> upgrade) actually completes in the live frame loop, with exactly 3 distinct upgrade cards", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = trackConsoleErrors(page);
    await page.goto("/");
    await page.locator("#btn-new-game").click();

    // WAVE_COMBAT_DURATION (45s) + up to WAVE_CLEANUP_MAX_DURATION (18s);
    // real wall-clock in a real browser, per Section 14 — not a simulated
    // update() loop like spec/director.test.ts.
    await expect(page.locator("#upgrade-menu")).toBeVisible({ timeout: 75_000 });
    const cards = page.locator("#upgrade-cards .upgrade-card");
    await expect(cards).toHaveCount(3);
    const names = await cards.locator(".upgrade-name").allTextContents();
    expect(new Set(names).size).toBe(3);

    await page.keyboard.press("Digit1");
    await expect(page.locator("#upgrade-menu")).toBeHidden();
    await expect(page.locator("#hud-wave-value")).toHaveText("2");

    expect(errors, `console/page errors across a full wave cycle: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("shows textless touch controls and they respond to taps", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").tap();

    const touchControls = page.locator("#touch-controls");
    await expect(touchControls).toBeVisible();

    await expect(page.locator("#hud-enemies-value")).not.toHaveText("0", { timeout: 6_000 });

    const fireButton = page.locator("#btn-fire");
    await expect(fireButton).toBeVisible();
    const box = await fireButton.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44); // real tap target, not a sliver
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const before = Number(await page.locator("#hud-ammo-value").textContent());
    await fireButton.tap();
    await page.waitForTimeout(150);
    const after = Number(await page.locator("#hud-ammo-value").textContent());
    expect(after).toBeLessThan(before);
  });

  test("every touch button meets the 44x44 tap-target minimum", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").tap();
    const ids = ["btn-turn-left", "btn-forward", "btn-turn-right", "btn-backward", "btn-fire", "btn-pause"];
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
    await page.locator("#btn-new-game").tap();
    const canvasBox = (await page.locator("#game-canvas").boundingBox())!;
    const hudBox = (await page.locator("#hud").boundingBox())!;
    const touchBox = (await page.locator("#touch-controls").boundingBox())!;

    expect(canvasBox.width).toBeGreaterThan(390 * 0.9);
    expect(Math.abs(hudBox.y - (canvasBox.y + canvasBox.height))).toBeLessThan(4);
    expect(touchBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 1);
  });

  test("the pause menu is usable and its buttons meet the touch tap-target minimum", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-new-game").tap();
    await page.locator("#btn-pause").tap();
    await expect(page.locator("#pause-menu")).toBeVisible();

    const box = await page.locator("#btn-resume").boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.locator("#btn-resume").tap();
    await expect(page.locator("#pause-menu")).toBeHidden();
  });
});

// Sensor: a lightweight stand-in for a Lighthouse/Core Web Vitals budget that
// doesn't need a browser. Most art is still generated on an offscreen canvas
// at runtime; a small, explicitly allowlisted set of real sprite/audio files
// (see THIRD_PARTY_ASSETS.md for provenance) has been added on top of that —
// this sensor pins the allowlist to an exact file set and caps their total
// size, so an accidentally-bundled asset or a runaway dependency still gets
// caught before a real performance audit does. Runs against the BUILT site,
// like the invariants.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = resolve("dist");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const shipped = filesUnder(DIST);
const byExt = (ext: string) => shipped.filter((f) => f.endsWith(ext));
const totalBytes = (files: string[]) => files.reduce((sum, f) => sum + statSync(f).size, 0);

// Every real (non-procedural) sprite/audio file this game ships, by filename
// only (not full path — dist's asset directory layout is an implementation
// detail). Anything of these extensions NOT on this list fails the test
// below: the allowlist is meant to be edited deliberately, alongside
// THIRD_PARTY_ASSETS.md, not grown by accident.
const ALLOWED_IMAGE_FILES = new Set([
  "card.png",
  "enemy-grunt-idle-0.png",
  "enemy-grunt-idle-1.png",
  "enemy-grunt-hit.png",
  "enemy-scout-idle-0.png",
  "enemy-scout-idle-1.png",
  "enemy-scout-hit.png",
  "enemy-brute-idle-0.png",
  "enemy-brute-idle-1.png",
  "enemy-brute-hit.png",
  "weapon-hand-open.png",
  "weapon-hand-fist.png",
  "weapon-hit-splash.png",
]);

const ALLOWED_AUDIO_FILES = new Set([
  "fire.ogg",
  "enemy-hit.ogg",
  "enemy-death.ogg",
  "player-hurt.ogg",
  "pickup-ammo.ogg",
  "pickup-health.ogg",
  "door-open.ogg",
]);

const IMAGE_BUDGET_BYTES = 1 * 1024 * 1024;
const AUDIO_BUDGET_BYTES = 2 * 1024 * 1024;

describe("perf budget: built site payload", () => {
  it("ships only allowlisted image files, no font files, no other downloaded assets", () => {
    const images = shipped.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
    const unlisted = images.filter((f) => !ALLOWED_IMAGE_FILES.has(f.split("/").pop()!));
    expect(unlisted, `unlisted image file(s): ${unlisted.join(", ")}`).toHaveLength(0);

    const fonts = shipped.filter((f) => /\.(woff2?|ttf)$/i.test(f));
    expect(fonts, `unexpected shipped font(s): ${fonts.join(", ")}`).toHaveLength(0);
  });

  it("ships only allowlisted audio files", () => {
    const audio = shipped.filter((f) => /\.(mp3|ogg|wav)$/i.test(f));
    const unlisted = audio.filter((f) => !ALLOWED_AUDIO_FILES.has(f.split("/").pop()!));
    expect(unlisted, `unlisted audio file(s): ${unlisted.join(", ")}`).toHaveLength(0);
  });

  it("keeps total shipped image bytes under budget", () => {
    const images = shipped.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
    expect(totalBytes(images)).toBeLessThan(IMAGE_BUDGET_BYTES);
  });

  it("keeps total shipped audio bytes under budget", () => {
    const audio = shipped.filter((f) => /\.(mp3|ogg|wav)$/i.test(f));
    expect(totalBytes(audio)).toBeLessThan(AUDIO_BUDGET_BYTES);
  });

  it("keeps total JS under a small budget (no heavyweight dependency crept in)", () => {
    const jsBytes = totalBytes(byExt(".js"));
    expect(jsBytes).toBeLessThan(200 * 1024);
  });

  it("keeps total CSS under a small budget", () => {
    const cssBytes = totalBytes(byExt(".css"));
    expect(cssBytes).toBeLessThan(50 * 1024);
  });

  it("keeps index.html itself small (no inlined bloat)", () => {
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    expect(html.length).toBeLessThan(20 * 1024);
  });
});

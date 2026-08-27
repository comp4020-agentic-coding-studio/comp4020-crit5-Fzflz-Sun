// Sensor: a lightweight stand-in for a Lighthouse/Core Web Vitals budget that
// doesn't need a browser. All art here is generated on an offscreen canvas at
// runtime rather than shipped as files, so the entire payload is script +
// markup + CSS — if that ever balloons (an accidentally-bundled asset, a
// runaway dependency), this is the sensor that should catch it before a real
// performance audit does. Runs against the BUILT site, like the invariants.
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

describe("perf budget: built site payload", () => {
  it("ships no external image/audio/font assets (art is procedural, not downloaded)", () => {
    const heavyAssets = shipped.filter((f) =>
      /\.(png|jpe?g|gif|webp|mp3|ogg|wav|woff2?|ttf)$/i.test(f) && !f.endsWith("card.png"),
    );
    expect(heavyAssets, `unexpected shipped asset(s): ${heavyAssets.join(", ")}`).toHaveLength(0);
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

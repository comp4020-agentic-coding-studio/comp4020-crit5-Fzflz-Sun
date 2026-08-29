// A tiny deterministic PRNG for every spawn-critical or save-reproducibility-
// sensitive decision (Spawn Director anchor tie-breaks, upgrade-card
// generation). Math.random() remains fine for purely cosmetic randomness
// (particle spread angles) that never needs to replay the same way after a
// save/load. mulberry32: one 32-bit integer of state, so the whole generator
// serializes as a single number for the save file.
export interface Rng {
  state: number;
  next(): number;
}

export function createRng(seed: number): Rng {
  const rng: Rng = {
    state: seed >>> 0,
    next(): number {
      rng.state = (rng.state + 0x6d2b79f5) >>> 0;
      let t = rng.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
  return rng;
}

/** Reconstructs an Rng from a previously-saved `.state` value — resuming the
 * exact sequence a save was mid-way through, not restarting it from seed. */
export function restoreRng(state: number): Rng {
  const rng = createRng(0);
  rng.state = state >>> 0;
  return rng;
}

/** Integer in [0, count) — for picking among a small fixed list (spawn
 * anchors, upgrade candidates). Never used for unbounded ranges. */
export function rngInt(rng: Rng, count: number): number {
  return Math.floor(rng.next() * count) % count;
}

/** Picks `n` distinct elements from `items` without replacement, preserving
 * nothing about input order — used for the 3-choice upgrade draw. Bounded by
 * `items.length`, never loops more than that many times. */
export function rngSampleDistinct<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = rngInt(rng, pool.length);
    picked.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return picked;
}

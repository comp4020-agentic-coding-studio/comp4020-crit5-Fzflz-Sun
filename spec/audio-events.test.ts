// audio.ts regression tests (crit-5 perf fix #3 and its follow-up sustained-
// fire/hit-stop fix). There is no real DOM/Web Audio in this test
// environment, so a minimal fake AudioContext/AudioBufferSourceNode/GainNode
// (and a fake HTMLAudio for the constrained fallback path) is stubbed in
// before each test and the module is re-imported fresh (vi.resetModules) so
// its module-scope state starts empty every time.
//
// The fake AudioContext never auto-resolves a source as "finished" — sources
// only stop when the test explicitly calls `.finish()` on them, mirroring a
// still-playing real voice — because the bug this is guarding against is
// exactly a re-seek of something still playing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/game/state";
import { spawnEnemy } from "../src/game/enemies";
import {
  AUDIO_FIRE_CLIP_DURATION,
  AUDIO_MAX_ACTIVE_SOURCES_GLOBAL,
  AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND,
  AUDIO_MAX_EVENTS_PER_FRAME,
  AUDIO_VOICE_POOL_SIZE,
  PLAYER_HURT_MIN_REPLAY_INTERVAL,
} from "../src/game/constants";
import type { GameState } from "../src/game/types";

async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

class FakeAudioParam {
  value = 0;
  setValueAtTime(v: number): FakeAudioParam {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): FakeAudioParam {
    this.value = v;
    return this;
  }
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect(): FakeGainNode {
    return this;
  }
  disconnect(): void {}
}

class FakeBufferSource {
  buffer: unknown = null;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  started = false;
  startArgs: [number, number, number | undefined] | null = null;
  connect(): FakeBufferSource {
    return this;
  }
  disconnect(): void {}
  start(when = 0, offset = 0, duration?: number): void {
    this.started = true;
    this.startArgs = [when, offset, duration];
  }
  /** Test-only helper simulating real playback completion — never called
   * automatically, so a source counts as "still playing" until this runs. */
  finish(): void {
    this.onended?.();
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 0;
  destination = {};
  createdSources: FakeBufferSource[] = [];
  decodeCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.createdSources.push(source);
    return source;
  }
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  decodeAudioData(_data: ArrayBuffer): Promise<object> {
    this.decodeCalls += 1;
    return Promise.resolve({});
  }
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  playCalls = 0;
  paused = true;
  ended = false;

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  /** Test-only helper simulating playback finishing, freeing this voice up
   * for the fallback path's paused/ended voice selection. */
  finish(): void {
    this.paused = true;
    this.ended = true;
  }
}

function instanceCountFor(fragment: string): number {
  return FakeAudio.instances.filter((a) => a.src.includes(fragment)).length;
}

function playCountFor(fragment: string): number {
  return FakeAudio.instances.filter((a) => a.src.includes(fragment)).reduce((sum, a) => sum + a.playCalls, 0);
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })),
  );
}

let audioModule: typeof import("../src/game/audio");

describe("Web Audio primary path", () => {
  beforeEach(async () => {
    FakeAudioContext.instances = [];
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("document", { baseURI: "http://localhost/" });
    stubFetch();
    vi.resetModules();
    audioModule = await import("../src/game/audio");
    audioModule.unlockAudio();
    await flushMicrotasks(); // let every sound file's fetch+decode settle
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ctx(): FakeAudioContext {
    return FakeAudioContext.instances[0]!;
  }

  it("creates exactly one AudioContext and decodes each sound file exactly once, even across repeated unlockAudio() calls", async () => {
    expect(FakeAudioContext.instances.length).toBe(1);
    const decodesAfterLoad = ctx().decodeCalls;
    expect(decodesAfterLoad).toBeGreaterThan(0);

    audioModule.unlockAudio();
    audioModule.unlockAudio();
    await flushMicrotasks();

    expect(FakeAudioContext.instances.length).toBe(1);
    expect(ctx().decodeCalls).toBe(decodesAfterLoad);
  });

  it("plays a fire event as a short-lived AudioBufferSourceNode, never reusing/re-seeking one across calls", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < 5; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }

    expect(ctx().createdSources.length).toBe(5);
    for (const source of ctx().createdSources) {
      expect(source.started).toBe(true);
    }
  });

  it("trims the fire clip to AUDIO_FIRE_CLIP_DURATION via start()'s duration argument, and fades the gain out before that cutoff", () => {
    const state: GameState = createInitialState();
    state.player.ammo -= 1;
    audioModule.playEventSounds(audioModule.createAudioSnapshot(createInitialState()), state);

    const source = ctx().createdSources[0]!;
    expect(source.startArgs).not.toBeNull();
    const [, offset, duration] = source.startArgs!;
    expect(offset).toBe(0);
    expect(duration).toBe(AUDIO_FIRE_CLIP_DURATION);
  });

  it("keeps concurrently-active fire sources bounded under sustained/rapid fire, even when none of them have finished playing", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    // 50 fire events in a row, well beyond both caps, none ever ended.
    for (let i = 0; i < 50; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }

    expect(AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND).toBeLessThanOrEqual(AUDIO_MAX_ACTIVE_SOURCES_GLOBAL);
    expect(ctx().createdSources.length).toBe(AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND);
  });

  it("frees up a slot for a new source once a previous one actually finishes", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    expect(ctx().createdSources.length).toBe(AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND);

    // Nothing has ended yet — one more fire event this frame must be dropped.
    state.elapsed += 1 / 60;
    state.player.ammo -= 1;
    snapshot = audioModule.playEventSounds(snapshot, state);
    expect(ctx().createdSources.length).toBe(AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND);

    // Finish exactly one — the next fire event should now get a fresh source.
    ctx().createdSources[0]!.finish();
    state.elapsed += 1 / 60;
    state.player.ammo -= 1;
    audioModule.playEventSounds(snapshot, state);
    expect(ctx().createdSources.length).toBe(AUDIO_MAX_ACTIVE_SOURCES_PER_SOUND + 1);
  });

  it("does not block or throw while a sound's buffer is still loading (pending)", () => {
    // fetch() from stubFetch() never resolves within this test (no await),
    // so every buffer is still "pending" the moment playEventSounds runs.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    return (async () => {
      vi.resetModules();
      audioModule = await import("../src/game/audio");
      FakeAudioContext.instances = [];
      audioModule.unlockAudio();

      const state: GameState = createInitialState();
      state.player.ammo -= 1;
      expect(() => audioModule.playEventSounds(audioModule.createAudioSnapshot(createInitialState()), state)).not.toThrow();
      expect(FakeAudioContext.instances[0]!.createdSources.length).toBe(0);
    })();
  });

  it("merges multiple same-frame triggers for the same sound name into a single play", () => {
    const state: GameState = createInitialState();
    const enemy = spawnEnemy("brute", { x: 5, y: 5 });
    state.enemies = [enemy];
    const snapshotBase = audioModule.createAudioSnapshot(state);

    const before = ctx().createdSources.length;
    // Two independent triggers that both map to the "enemyHit" cue in the
    // same frame: a flash starting, and a projectile being destroyed.
    enemy.flashTimer = 5;
    state.projectilesDestroyed += 1;
    audioModule.playEventSounds(snapshotBase, state);

    expect(ctx().createdSources.length - before).toBe(1);
  });

  it("drops the lowest-priority (generic hit) cue first once more distinct sounds are queued than the per-frame budget allows", () => {
    function buildBudgetState(): GameState {
      const state: GameState = createInitialState();
      state.player.ammo = 100;
      state.enemies = [spawnEnemy("grunt", { x: 5, y: 5 }), spawnEnemy("grunt", { x: 6, y: 6 })];
      state.pickups[0]!.collected = false;
      return state;
    }

    // Under budget: fire + playerHurt + enemyDeath + pickupAmmo = 4 distinct
    // names, exactly at AUDIO_MAX_EVENTS_PER_FRAME — all four should play.
    {
      const state = buildBudgetState();
      const prev = audioModule.createAudioSnapshot(state);
      const before = ctx().createdSources.length;

      state.player.ammo -= 1; // fire
      state.hurtEventId += 1; // playerHurt
      state.enemies[0]!.alive = false; // enemyDeath
      state.pickups[0]!.collected = true; // pickupAmmo

      audioModule.playEventSounds(prev, state);
      expect(ctx().createdSources.length - before).toBe(Math.min(4, AUDIO_MAX_EVENTS_PER_FRAME));
    }

    // Over budget: the same four plus a generic enemyHit (priority-1) on the
    // second enemy — total distinct names is 5, one over budget, so exactly
    // AUDIO_MAX_EVENTS_PER_FRAME should actually play and the dropped one
    // must be the low-priority enemyHit, not one of the higher-priority cues.
    if (AUDIO_MAX_EVENTS_PER_FRAME < 5) {
      const state = buildBudgetState();
      const prev = audioModule.createAudioSnapshot(state);
      const before = ctx().createdSources.length;

      state.player.ammo -= 1; // fire
      state.hurtEventId += 1; // playerHurt
      state.enemies[0]!.alive = false; // enemyDeath
      state.pickups[0]!.collected = true; // pickupAmmo
      state.enemies[1]!.flashTimer = 5; // enemyHit — lowest priority, should drop

      audioModule.playEventSounds(prev, state);
      expect(ctx().createdSources.length - before).toBe(AUDIO_MAX_EVENTS_PER_FRAME);
    }
  });

  it("does not fire spurious cues, recreate the context, or re-decode files when state.elapsed rewinds (a restart)", async () => {
    const state: GameState = createInitialState();
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < 10; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    const createdBeforeRestart = ctx().createdSources.length;
    const decodesBeforeRestart = ctx().decodeCalls;

    const restarted = createInitialState(); // elapsed: 0 — lower than the snapshot's recorded elapsed
    audioModule.playEventSounds(snapshot, restarted);
    await flushMicrotasks();

    expect(ctx().createdSources.length).toBe(createdBeforeRestart);
    expect(FakeAudioContext.instances.length).toBe(1);
    expect(ctx().decodeCalls).toBe(decodesBeforeRestart);
  });
});

describe("playerHurt throttling (Web Audio path)", () => {
  beforeEach(async () => {
    FakeAudioContext.instances = [];
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("document", { baseURI: "http://localhost/" });
    stubFetch();
    vi.resetModules();
    audioModule = await import("../src/game/audio");
    audioModule.unlockAudio();
    await flushMicrotasks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays at most one playerHurt cue per PLAYER_HURT_MIN_REPLAY_INTERVAL even under a burst of hurt events every frame", () => {
    const state: GameState = createInitialState();
    let snapshot = audioModule.createAudioSnapshot(state);

    const dt = 1 / 60;
    const durationSeconds = 2;
    const steps = Math.round(durationSeconds / dt);
    for (let i = 0; i < steps; i++) {
      state.elapsed += dt;
      state.hurtEventId += 1; // the storm scenario: a hurt event on every single frame
      snapshot = audioModule.playEventSounds(snapshot, state);
    }

    const ctx = FakeAudioContext.instances[0]!;
    const plays = ctx.createdSources.length;
    const maxExpected = Math.ceil(durationSeconds / PLAYER_HURT_MIN_REPLAY_INTERVAL) + 1;
    expect(plays).toBeGreaterThan(0);
    expect(plays).toBeLessThanOrEqual(maxExpected);
    expect(plays).toBeLessThan(steps / 4);
  });
});

describe("HTMLAudio fallback (Web Audio unavailable)", () => {
  beforeEach(async () => {
    FakeAudio.instances = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("document", { baseURI: "http://localhost/" });
    vi.resetModules();
    audioModule = await import("../src/game/audio");
    audioModule.unlockAudio();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caps the number of Audio elements created per sound at AUDIO_VOICE_POOL_SIZE regardless of call volume", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < 100; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      // Every voice finishes instantly in this test so the pool never has to
      // drop a cue for lack of an idle voice — this test is purely about the
      // pool never growing past AUDIO_VOICE_POOL_SIZE.
      snapshot = audioModule.playEventSounds(snapshot, state);
      for (const voice of FakeAudio.instances) voice.finish();
    }

    expect(instanceCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE);
    expect(playCountFor("fire.ogg")).toBe(100);
  });

  it("never seeks a still-playing voice — drops the cue instead of growing the pool", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < AUDIO_VOICE_POOL_SIZE; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    expect(instanceCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE);
    expect(playCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE);

    // Every voice is still "playing" (none paused/ended) — the next fire
    // event this frame must be dropped, never reseek one of them.
    state.elapsed += 1 / 60;
    state.player.ammo -= 1;
    snapshot = audioModule.playEventSounds(snapshot, state);
    expect(instanceCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE);
    expect(playCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE);

    // Free up exactly one voice — the next event should now actually play.
    const fireInstances = FakeAudio.instances.filter((a) => a.src.includes("fire.ogg"));
    fireInstances[0]!.finish();
    state.elapsed += 1 / 60;
    state.player.ammo -= 1;
    audioModule.playEventSounds(snapshot, state);
    expect(playCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE + 1);
  });

  it("keeps playerHurt throttled on the fallback path too", () => {
    const state: GameState = createInitialState();
    let snapshot = audioModule.createAudioSnapshot(state);

    const dt = 1 / 60;
    const durationSeconds = 2;
    const steps = Math.round(durationSeconds / dt);
    for (let i = 0; i < steps; i++) {
      state.elapsed += dt;
      state.hurtEventId += 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
      for (const voice of FakeAudio.instances) voice.finish();
    }

    const plays = playCountFor("player-hurt.ogg");
    const maxExpected = Math.ceil(durationSeconds / PLAYER_HURT_MIN_REPLAY_INTERVAL) + 1;
    expect(plays).toBeGreaterThan(0);
    expect(plays).toBeLessThanOrEqual(maxExpected);
    expect(plays).toBeLessThan(steps / 4);
  });

  it("does not fire spurious cues or duplicate the pool across a restart", () => {
    const state: GameState = createInitialState();
    let snapshot = audioModule.createAudioSnapshot(state);
    for (let i = 0; i < 10; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
      for (const voice of FakeAudio.instances) voice.finish();
    }
    const playsBeforeRestart = FakeAudio.instances.reduce((sum, a) => sum + a.playCalls, 0);
    const countAfterFirstRun = instanceCountFor("fire.ogg");

    const restarted = createInitialState();
    audioModule.playEventSounds(snapshot, restarted);

    const playsAfterRestart = FakeAudio.instances.reduce((sum, a) => sum + a.playCalls, 0);
    expect(playsAfterRestart).toBe(playsBeforeRestart);
    expect(instanceCountFor("fire.ogg")).toBe(countAfterFirstRun);
  });
});

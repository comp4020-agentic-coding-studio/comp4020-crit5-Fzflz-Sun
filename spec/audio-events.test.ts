// audio.ts regression tests (crit-5 perf fix #3). There is no real DOM/Audio
// in this test environment, so a minimal fake Audio/document is stubbed in
// before each test and the module is re-imported fresh (vi.resetModules) so
// its module-scope voice pools start empty every time. Verifies playSound
// never allocates an unbounded number of HTMLAudioElements no matter how many
// times it's called, playerHurt is throttled independently of how many hurt
// events land in a short window, and a restart (elapsed rewinding) neither
// fires spurious cues nor rebuilds/duplicates the pool.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/game/state";
import { AUDIO_VOICE_POOL_SIZE, PLAYER_HURT_MIN_REPLAY_INTERVAL } from "../src/game/constants";
import type { GameState } from "../src/game/types";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  playCalls = 0;

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    this.playCalls += 1;
    return Promise.resolve();
  }
}

function instanceCountFor(fragment: string): number {
  return FakeAudio.instances.filter((a) => a.src.includes(fragment)).length;
}

function playCountFor(fragment: string): number {
  return FakeAudio.instances.filter((a) => a.src.includes(fragment)).reduce((sum, a) => sum + a.playCalls, 0);
}

let audioModule: typeof import("../src/game/audio");

beforeEach(async () => {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("document", { baseURI: "http://localhost/" });
  vi.resetModules();
  audioModule = await import("../src/game/audio");
  audioModule.unlockAudio();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audio voice pooling", () => {
  it("caps the number of Audio elements created per sound at AUDIO_VOICE_POOL_SIZE regardless of call volume", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < 100; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1; // decreasing ammo triggers the "fire" cue every iteration
      snapshot = audioModule.playEventSounds(snapshot, state);
    }

    expect(instanceCountFor("fire.ogg")).toBe(AUDIO_VOICE_POOL_SIZE);
    expect(playCountFor("fire.ogg")).toBe(100);
  });

  it("reuses the same pool across many frames instead of rebuilding it — no growth after warm-up", () => {
    const state: GameState = createInitialState();
    state.player.ammo = 500;
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < AUDIO_VOICE_POOL_SIZE; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    const afterWarmup = instanceCountFor("fire.ogg");
    expect(afterWarmup).toBe(AUDIO_VOICE_POOL_SIZE);

    for (let i = 0; i < 200; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    expect(instanceCountFor("fire.ogg")).toBe(afterWarmup);
  });
});

describe("playerHurt throttling", () => {
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

    const plays = playCountFor("player-hurt.ogg");
    const maxExpected = Math.ceil(durationSeconds / PLAYER_HURT_MIN_REPLAY_INTERVAL) + 1;
    expect(plays).toBeGreaterThan(0);
    expect(plays).toBeLessThanOrEqual(maxExpected);
    expect(plays).toBeLessThan(steps / 4);
  });
});

describe("restart resync", () => {
  it("does not fire spurious cues when state.elapsed rewinds (a restart)", () => {
    const state: GameState = createInitialState();
    let snapshot = audioModule.createAudioSnapshot(state);

    for (let i = 0; i < 30; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      state.hurtEventId += 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    const playsBeforeRestart = FakeAudio.instances.reduce((sum, a) => sum + a.playCalls, 0);

    const restarted = createInitialState(); // elapsed: 0 — lower than the snapshot's recorded elapsed
    audioModule.playEventSounds(snapshot, restarted);

    const playsAfterRestart = FakeAudio.instances.reduce((sum, a) => sum + a.playCalls, 0);
    expect(playsAfterRestart).toBe(playsBeforeRestart);
  });

  it("never duplicates the voice pool across repeated restarts", () => {
    const state: GameState = createInitialState();
    let snapshot = audioModule.createAudioSnapshot(state);
    for (let i = 0; i < 10; i++) {
      state.elapsed += 1 / 60;
      state.player.ammo -= 1;
      snapshot = audioModule.playEventSounds(snapshot, state);
    }
    const countAfterFirstRun = instanceCountFor("fire.ogg");

    for (let restart = 0; restart < 5; restart++) {
      const fresh = createInitialState();
      snapshot = audioModule.playEventSounds(snapshot, fresh); // triggers the resync branch
      for (let i = 0; i < 10; i++) {
        fresh.elapsed += 1 / 60;
        fresh.player.ammo -= 1;
        snapshot = audioModule.playEventSounds(snapshot, fresh);
      }
    }

    expect(instanceCountFor("fire.ogg")).toBe(countAfterFirstRun);
  });
});

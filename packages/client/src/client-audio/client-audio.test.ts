import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAmbientAudioVolume,
  isAmbientAudioMuted,
  setAmbientAudioMuted,
  setAmbientAudioVolume,
  startAmbientAudio
} from "./client-audio.js";

const stubWindowWithoutAudioContext = (): Map<string, string> => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  });
  vi.stubGlobal("document", { addEventListener: () => undefined, hidden: false });
  return storage;
};

/** A fake HTMLAudioElement good enough to drive playTrack/attemptPlay: records play() calls, lets the test control whether play() resolves or rejects, and dispatches "ended"/"error"/"playing" listeners registered via addEventListener. */
class FakeAudio {
  src = "";
  volume = 1;
  playCount = 0;
  nextPlayResult: "resolve" | "reject" = "resolve";
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(): void {
    // Not exercised by these tests — the module never removes audio-element listeners.
  }

  play(): Promise<void> {
    this.playCount += 1;
    return this.nextPlayResult === "resolve" ? Promise.resolve() : Promise.reject(new Error("NotAllowedError"));
  }

  pause(): void {
    // Not exercised by these tests.
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

/** Stubs window/document with real (capturing) event listener maps so armRetryOnNextInteraction's pointerdown/keydown listeners can be inspected and fired from tests, and stubs the global Audio constructor to hand back a shared FakeAudio instance. */
const stubWindowWithFakeAudio = (): { storage: Map<string, string>; fakeAudio: FakeAudio; fireWindowEvent: (type: string) => void } => {
  const storage = new Map<string, string>();
  const windowListeners = new Map<string, Array<() => void>>();
  const fakeAudio = new FakeAudio();

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    addEventListener: (type: string, listener: () => void) => {
      const list = windowListeners.get(type) ?? [];
      list.push(listener);
      windowListeners.set(type, list);
    },
    removeEventListener: (type: string, listener: () => void) => {
      const list = windowListeners.get(type) ?? [];
      windowListeners.set(
        type,
        list.filter((entry) => entry !== listener)
      );
    }
  });
  vi.stubGlobal("document", { addEventListener: () => undefined, hidden: false });
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        return fakeAudio as unknown as HTMLAudioElement;
      }
    }
  );

  const fireWindowEvent = (type: string): void => {
    for (const listener of [...(windowListeners.get(type) ?? [])]) listener();
  };

  return { storage, fakeAudio, fireWindowEvent };
};

describe("client-audio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing and does not throw when Audio is unavailable", () => {
    stubWindowWithoutAudioContext();
    expect(() => startAmbientAudio()).not.toThrow();
  });

  it("persists and clamps volume", () => {
    stubWindowWithoutAudioContext();
    setAmbientAudioVolume(1.5);
    expect(getAmbientAudioVolume()).toBe(1);
    setAmbientAudioVolume(-1);
    expect(getAmbientAudioVolume()).toBe(0);
    setAmbientAudioVolume(0.4);
    expect(getAmbientAudioVolume()).toBe(0.4);
  });

  it("defaults to unmuted on a fresh load with no stored preference — the soundtrack is on by default", async () => {
    stubWindowWithoutAudioContext();
    vi.resetModules();
    const fresh = await import("./client-audio.js");
    expect(fresh.isAmbientAudioMuted()).toBe(false);
  });

  it("persists the muted flag, and updates it independently of readStoredMuted's own module-load default", () => {
    stubWindowWithoutAudioContext();
    setAmbientAudioMuted(true);
    expect(isAmbientAudioMuted()).toBe(true);
    setAmbientAudioMuted(false);
    expect(isAmbientAudioMuted()).toBe(false);
  });

  it("retries playback on the player's next interaction after play() is rejected", async () => {
    const { fakeAudio, fireWindowEvent } = stubWindowWithFakeAudio();
    vi.resetModules();
    const fresh = await import("./client-audio.js");

    fakeAudio.nextPlayResult = "reject";
    fresh.startAmbientAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(1);

    // A blocked play() must not surface as an unhandled rejection — it should
    // just get retried on the next pointer/key interaction instead.
    fakeAudio.nextPlayResult = "resolve";
    fireWindowEvent("pointerdown");
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(2);
  });

  it("does not retry playback if the player is muted when the next interaction happens", async () => {
    const { fakeAudio, fireWindowEvent } = stubWindowWithFakeAudio();
    vi.resetModules();
    const fresh = await import("./client-audio.js");

    fakeAudio.nextPlayResult = "reject";
    fresh.startAmbientAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(1);

    fresh.setAmbientAudioMuted(true);
    fireWindowEvent("pointerdown");
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(1);
  });

  it("retries immediately when re-enabled via startAmbientAudio after a prior failure", async () => {
    const { fakeAudio } = stubWindowWithFakeAudio();
    vi.resetModules();
    const fresh = await import("./client-audio.js");

    fakeAudio.nextPlayResult = "reject";
    fresh.startAmbientAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(1);

    // Simulates re-checking the "Background Music" settings checkbox: the
    // module is already initialized, so this must retry rather than no-op.
    fakeAudio.nextPlayResult = "resolve";
    fresh.startAmbientAudio();
    expect(fakeAudio.playCount).toBe(2);
  });

  it("clears a pending interaction-retry listener when startAmbientAudio() retries directly, so a later interaction doesn't double-play", async () => {
    const { fakeAudio, fireWindowEvent } = stubWindowWithFakeAudio();
    vi.resetModules();
    const fresh = await import("./client-audio.js");

    // A failed play() arms a pointerdown/keydown retry listener.
    fakeAudio.nextPlayResult = "reject";
    fresh.startAmbientAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(1);

    // Re-enabling via the settings checkbox retries directly — this must
    // disarm the stale listener from the failure above, not stack on top of it.
    fakeAudio.nextPlayResult = "resolve";
    fresh.startAmbientAudio();
    expect(fakeAudio.playCount).toBe(2);

    // A later, unrelated interaction must not trigger an extra play() call
    // from the listener that should have been cleared.
    fireWindowEvent("pointerdown");
    await Promise.resolve();
    expect(fakeAudio.playCount).toBe(2);
  });

  it("skips to the next track when the current one errors, and stops once every track has failed", async () => {
    const { fakeAudio } = stubWindowWithFakeAudio();
    vi.resetModules();
    const fresh = await import("./client-audio.js");

    fresh.startAmbientAudio();
    const firstSrc = fakeAudio.src;
    expect(fakeAudio.playCount).toBe(1);

    fakeAudio.dispatch("error");
    expect(fakeAudio.playCount).toBe(2);
    expect(fakeAudio.src).not.toBe(firstSrc);

    const secondSrc = fakeAudio.src;
    fakeAudio.dispatch("error");
    // Both tracks have now failed back-to-back — stop instead of looping forever.
    expect(fakeAudio.playCount).toBe(2);
    expect(fakeAudio.src).toBe(secondSrc);
  });
});

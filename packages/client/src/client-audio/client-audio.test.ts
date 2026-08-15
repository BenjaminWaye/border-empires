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
});

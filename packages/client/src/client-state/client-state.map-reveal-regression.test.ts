import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./client-state.js";
import { setDebugAuthEmail } from "../client-debug/client-debug.js";

describe("client state map reveal bootstrap regression", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with map reveal disabled even when stale debug-account storage exists", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });

    setDebugAuthEmail("bw199005@gmail.com");
    storage.set("be-map-reveal:bw199005@gmail.com", "1");

    expect(createInitialState().mapRevealEnabled).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { isMusterUnlocked, markMusterUnlocked } from "./client-muster-unlock-storage.js";

const stubWindowStorage = (): Map<string, string> => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  return storage;
};

describe("client-muster-unlock-storage", () => {
  it("is not unlocked by default", () => {
    stubWindowStorage();
    expect(isMusterUnlocked("a@example.com")).toBe(false);
  });

  it("stays unlocked once marked — no TTL, unlike discovery tips", () => {
    stubWindowStorage();
    markMusterUnlocked("a@example.com");
    expect(isMusterUnlocked("a@example.com")).toBe(true);
  });

  it("scopes the unlock per account", () => {
    stubWindowStorage();
    markMusterUnlocked("a@example.com");
    expect(isMusterUnlocked("a@example.com")).toBe(true);
    expect(isMusterUnlocked("b@example.com")).toBe(false);
  });

  it("tolerates storage failures without throwing", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        }
      }
    });
    expect(() => markMusterUnlocked("a@example.com")).not.toThrow();
    expect(isMusterUnlocked("a@example.com")).toBe(false);
  });
});

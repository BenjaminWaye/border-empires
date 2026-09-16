import { describe, expect, it, vi } from "vitest";
import { registerHintStateSender } from "../client-discovery-tips/client-hint-server-sync.js";
import { hydrateMusterUnlockFromServer, isMusterUnlocked, markMusterUnlocked } from "./client-muster-unlock-storage.js";

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
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(false);
  });

  it("stays unlocked for the season it was marked in — no TTL within a season", () => {
    stubWindowStorage();
    markMusterUnlocked("a@example.com", "season-1");
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(true);
  });

  it("does not carry an unlock into a different season", () => {
    stubWindowStorage();
    markMusterUnlocked("a@example.com", "season-1");
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(true);
    expect(isMusterUnlocked("a@example.com", "season-2")).toBe(false);
  });

  it("treats an unknown season id as locked", () => {
    stubWindowStorage();
    markMusterUnlocked("a@example.com", "season-1");
    expect(isMusterUnlocked("a@example.com", undefined)).toBe(false);
  });

  it("scopes the unlock per account", () => {
    stubWindowStorage();
    markMusterUnlocked("a@example.com", "season-1");
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(true);
    expect(isMusterUnlocked("b@example.com", "season-1")).toBe(false);
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
    expect(() => markMusterUnlocked("a@example.com", "season-1")).not.toThrow();
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(false);
  });

  it("pushes the unlock (as the season id) to the server-persisted hint state when marked", () => {
    stubWindowStorage();
    const sent: unknown[] = [];
    registerHintStateSender((patch) => sent.push(patch));
    markMusterUnlocked("a@example.com", "season-1");
    expect(sent).toEqual([{ musterUnlockedSeasonId: "season-1" }]);
  });

  it("hydrates a server-side unlock into local storage only when the season matches", () => {
    stubWindowStorage();
    hydrateMusterUnlockFromServer("", "season-1", "a@example.com");
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(false);

    // Server has an unlock from a DIFFERENT (earlier) season -- must not carry over.
    hydrateMusterUnlockFromServer("season-0", "season-1", "a@example.com");
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(false);

    hydrateMusterUnlockFromServer("season-1", "season-1", "a@example.com");
    expect(isMusterUnlocked("a@example.com", "season-1")).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearIntegrityWarningDismissed,
  isIntegrityWarningDismissed,
  setIntegrityWarningDismissed
} from "./client-integrity-warning-storage.js";

const STORAGE_KEY = "be-integrity-warning-dismissed-at";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

describe("client-integrity-warning-storage", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    storage = stubWindowStorage();
  });

  it("is not dismissed when no value is stored", () => {
    expect(isIntegrityWarningDismissed()).toBe(false);
  });

  it("is dismissed immediately after setIntegrityWarningDismissed", () => {
    setIntegrityWarningDismissed();
    expect(isIntegrityWarningDismissed()).toBe(true);
  });

  it("stays dismissed within the 30-day window", () => {
    storage.set(STORAGE_KEY, String(Date.now() - (THIRTY_DAYS_MS - 60_000)));
    expect(isIntegrityWarningDismissed()).toBe(true);
  });

  it("decays after 30 days", () => {
    storage.set(STORAGE_KEY, String(Date.now() - (THIRTY_DAYS_MS + 60_000)));
    expect(isIntegrityWarningDismissed()).toBe(false);
  });

  it("clearIntegrityWarningDismissed removes the stored dismissal", () => {
    setIntegrityWarningDismissed();
    clearIntegrityWarningDismissed();
    expect(isIntegrityWarningDismissed()).toBe(false);
  });

  it("ignores malformed stored values", () => {
    storage.set(STORAGE_KEY, "not-a-number");
    expect(isIntegrityWarningDismissed()).toBe(false);
  });
});

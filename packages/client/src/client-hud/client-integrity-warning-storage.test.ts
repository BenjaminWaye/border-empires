import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearIntegrityWarningDismissed,
  isIntegrityWarningDismissed,
  setIntegrityWarningDismissed
} from "./client-integrity-warning-storage.js";

const storageKeyFor = (authEmail?: string | null): string =>
  `be-integrity-warning-dismissed-at:${(authEmail ?? "").trim().toLowerCase() || "anonymous"}`;
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
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(false);
  });

  it("is dismissed immediately after setIntegrityWarningDismissed", () => {
    setIntegrityWarningDismissed("a@example.com");
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(true);
  });

  it("stays dismissed within the 30-day window", () => {
    storage.set(storageKeyFor("a@example.com"), String(Date.now() - (THIRTY_DAYS_MS - 60_000)));
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(true);
  });

  it("decays after 30 days", () => {
    storage.set(storageKeyFor("a@example.com"), String(Date.now() - (THIRTY_DAYS_MS + 60_000)));
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(false);
  });

  it("clearIntegrityWarningDismissed removes the stored dismissal", () => {
    setIntegrityWarningDismissed("a@example.com");
    clearIntegrityWarningDismissed("a@example.com");
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(false);
  });

  it("ignores malformed stored values", () => {
    storage.set(storageKeyFor("a@example.com"), "not-a-number");
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(false);
  });

  it("scopes dismissal per account so one account's dismissal doesn't leak to another", () => {
    setIntegrityWarningDismissed("a@example.com");
    expect(isIntegrityWarningDismissed("a@example.com")).toBe(true);
    expect(isIntegrityWarningDismissed("b@example.com")).toBe(false);
  });
});

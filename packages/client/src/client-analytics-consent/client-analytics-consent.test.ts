// @vitest-environment happy-dom
// Analytics runs only with consent (plan step 8f; docs/legal-drafts/README.md item 11):
// nothing is started before "Yes", and withdrawing switches it off and removes its cookies.
import type { Analytics } from "firebase/analytics";
import { describe, expect, it, vi } from "vitest";

import { ANALYTICS_CONSENT_STORAGE_KEY, createAnalyticsConsent, deleteAnalyticsCookies } from "./client-analytics-consent.js";

const memoryStorage = (initial: Record<string, string> = {}): Storage => {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); }
  };
};

const setup = (store = memoryStorage()) => {
  const instance = { app: {} } as unknown as Analytics;
  const start = vi.fn(() => instance);
  const setCollection = vi.fn();
  const clearCookies = vi.fn();
  const consent = createAnalyticsConsent({ start, setCollection, store, clearCookies, now: () => 1_000 });
  return { instance, start, setCollection, clearCookies, consent, store };
};

describe("analytics consent", () => {
  it("starts nothing before the player has said yes", () => {
    const { consent, start } = setup();
    expect(consent.choice()).toBeUndefined();
    expect(consent.analytics()).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts analytics on yes, remembers it, and starts it at once on the next visit", () => {
    const { consent, start, instance, store } = setup();
    consent.grant();
    expect(start).toHaveBeenCalledTimes(1);
    expect(consent.analytics()).toBe(instance);
    expect(JSON.parse(store.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "{}")).toEqual({ choice: "granted", at: 1_000 });
    const next = setup(store);
    expect(next.consent.choice()).toBe("granted");
    expect(next.start).toHaveBeenCalledTimes(1);
  });

  it("switches collection off and deletes the cookies when consent is withdrawn, and back on when given again", () => {
    const { consent, setCollection, clearCookies, instance, start } = setup();
    consent.grant();
    consent.withdraw();
    expect(consent.analytics()).toBeUndefined();
    expect(setCollection).toHaveBeenCalledWith(instance, false);
    expect(clearCookies).toHaveBeenCalledTimes(1);
    consent.grant();
    expect(setCollection).toHaveBeenLastCalledWith(instance, true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(consent.analytics()).toBe(instance);
  });

  it("remembers no, and never starts", () => {
    const { consent, store } = setup();
    consent.withdraw();
    const next = setup(store);
    expect(next.consent.choice()).toBe("denied");
    expect(next.start).not.toHaveBeenCalled();
  });

  it("carries on without analytics where it cannot start or storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    const consent = createAnalyticsConsent({ start: () => { throw new Error("unsupported"); }, setCollection: vi.fn(), store: blocked, clearCookies: vi.fn() });
    expect(consent.choice()).toBeUndefined();
    consent.grant();
    expect(consent.choice()).toBe("granted");
    expect(consent.analytics()).toBeUndefined();
  });

  it("deletes Google Analytics' cookies and leaves the others", () => {
    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_ABC=GS1.1.1; path=/";
    document.cookie = "keep=1; path=/";
    deleteAnalyticsCookies(document);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toMatch(/keep=1/);
  });
});

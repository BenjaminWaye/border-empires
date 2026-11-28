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
  const setConsentMode = vi.fn();
  const forgetDevice = vi.fn(async () => undefined);
  const clearCookies = vi.fn();
  const consent = createAnalyticsConsent({ start, setCollection, setConsentMode, forgetDevice, store, clearCookies, now: () => 1_000 });
  return { instance, start, setCollection, setConsentMode, forgetDevice, clearCookies, consent, store };
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

  it("switches collection off and deletes the cookies and the installation id when consent is withdrawn, and back on when given again", () => {
    const { consent, setCollection, setConsentMode, forgetDevice, clearCookies, instance, start } = setup();
    // Cookies left by earlier builds go at start-up while there is no yes.
    expect(clearCookies).toHaveBeenCalledTimes(1);
    consent.grant();
    expect(setConsentMode).toHaveBeenLastCalledWith(true);
    consent.withdraw();
    expect(consent.analytics()).toBeUndefined();
    expect(setConsentMode).toHaveBeenLastCalledWith(false);
    expect(setCollection).toHaveBeenCalledWith(instance, false);
    expect(forgetDevice).toHaveBeenCalledTimes(1);
    expect(clearCookies).toHaveBeenCalledTimes(2);
    consent.grant();
    expect(setCollection).toHaveBeenLastCalledWith(instance, true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(consent.analytics()).toBe(instance);
  });

  it("tells listeners every answer", () => {
    const { consent } = setup();
    const heard: string[] = [];
    consent.onChange((answer) => heard.push(answer));
    consent.grant();
    consent.withdraw();
    expect(heard).toEqual(["granted", "denied"]);
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

  it("keeps a yes's cookies at start-up", () => {
    const store = memoryStorage({ [ANALYTICS_CONSENT_STORAGE_KEY]: JSON.stringify({ choice: "granted", at: 1 }) });
    expect(setup(store).clearCookies).not.toHaveBeenCalled();
  });

  it("deletes the cookies on the site's own domain and every parent domain", () => {
    const written: string[] = [];
    const doc = {
      location: { hostname: "play.borderempires.com" },
      get cookie() { return "_ga=GA1; _ga_ABC=GS1; _gcl_au=1; keep=1"; },
      set cookie(value: string) { written.push(value); }
    } as unknown as Document;
    deleteAnalyticsCookies(doc);
    expect(written.filter((value) => value.startsWith("keep="))).toEqual([]);
    for (const name of ["_ga", "_ga_ABC", "_gcl_au"]) {
      expect(written).toContain(`${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.borderempires.com`);
      expect(written).toContain(`${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.play.borderempires.com`);
    }
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

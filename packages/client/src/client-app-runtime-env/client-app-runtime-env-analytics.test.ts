// @vitest-environment happy-dom
// Regression (plan step 8f): the client used to start Google Analytics at
// load for everyone. It must start only after a stored yes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYTICS_CONSENT_STORAGE_KEY } from "../client-analytics-consent/client-analytics-consent.js";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
vi.mock("firebase/app", () => ({ getApps: vi.fn(() => []), initializeApp: vi.fn((config: unknown) => config) }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(function GoogleAuthProviderMock(this: unknown) { return this; }),
  OAuthProvider: vi.fn(function OAuthProviderMock(this: unknown) { return Object.assign(this as object, { addScope: vi.fn(), setCustomParameters: vi.fn() }); }),
  initializeAuth: vi.fn(() => ({})),
  indexedDBLocalPersistence: { type: "LOCAL" },
  browserLocalPersistence: { type: "LOCAL" },
  getAuth: vi.fn(() => ({}))
}));
vi.mock("firebase/analytics", () => ({ getAnalytics: vi.fn(() => ({ app: {} })), setAnalyticsCollectionEnabled: vi.fn(), setConsent: vi.fn() }));
vi.mock("firebase/installations", () => ({ getInstallations: vi.fn(() => ({})), deleteInstallations: vi.fn(async () => undefined) }));

const { getAnalytics } = await import("firebase/analytics");
const { createClientFirebaseSetup } = await import("./client-app-runtime-env.js");

describe("starting analytics", () => {
  beforeEach(() => { window.localStorage.clear(); vi.mocked(getAnalytics).mockClear(); });
  afterEach(() => { window.localStorage.clear(); });

  it("does not start Google Analytics before the player says yes", () => {
    const setup = createClientFirebaseSetup();
    expect(getAnalytics).not.toHaveBeenCalled();
    expect(setup.analytics()).toBeUndefined();
    setup.analyticsConsent?.grant();
    expect(getAnalytics).toHaveBeenCalledTimes(1);
    expect(setup.analytics()).toBeDefined();
  });

  it("runs no analytics and asks nothing on staging", () => {
    const location = window.location.href;
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "location", { value: { ...window.location, hostname: "staging.borderempires.com" }, configurable: true });
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify({ choice: "granted", at: 1 }));
      const setup = createClientFirebaseSetup();
      expect(setup.analyticsConsent).toBeUndefined();
      expect(getAnalytics).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { value: new URL(location), configurable: true });
    }
  });

  it("starts it at load after an earlier yes, and not after a no", () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify({ choice: "denied", at: 1 }));
    createClientFirebaseSetup();
    expect(getAnalytics).not.toHaveBeenCalled();
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify({ choice: "granted", at: 1 }));
    createClientFirebaseSetup();
    expect(getAnalytics).toHaveBeenCalledTimes(1);
  });
});

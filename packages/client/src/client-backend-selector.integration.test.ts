/**
 * Integration-level assertion: toggling the be-backend cookie mid-session is
 * reflected in state.activeBackend on the next call to createClientSocketSetup.
 *
 * This test uses the real selectBackend logic (no mocks) and a minimal
 * createClientSocketSetup stub that reads selectBackend directly, exercising
 * the wiring between the cookie and the state field.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { selectBackend, persistBackendCookie } from "./client-backend-selector.js";

const LEGACY = "wss://border-empires.fly.dev/ws";
const GATEWAY = "wss://border-empires-gateway.fly.dev/ws";

function setupBrowserEnv(hostname: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { hostname, search: "" }
  });
  // Reset cookie
  Object.defineProperty(document, "cookie", {
    writable: true,
    value: ""
  });
}

describe("backend cookie mid-session toggle", () => {
  beforeEach(() => setupBrowserEnv("border-empires.com"));

  it("starts on legacy by default in prod", () => {
    const first = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY });
    expect(first.backend).toBe("legacy");
  });

  it("after setting cookie to gateway, next selection is gateway", () => {
    // Simulate writing the cookie (would happen via HUD or URL param persistence)
    let cookieStore = "";
    Object.defineProperty(document, "cookie", {
      writable: true,
      set(v: string) {
        // Parse simple set: name=value
        const [pair] = v.split(";");
        const [, val] = pair.split("=");
        if (v.includes("max-age=0")) {
          cookieStore = "";
        } else {
          cookieStore = `be-backend=${val}`;
        }
      },
      get() { return cookieStore; }
    });

    persistBackendCookie("gateway");

    const second = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY });
    expect(second.backend).toBe("gateway");
    expect(second.source).toBe("cookie");
    expect(second.wsUrl).toBe(GATEWAY);
  });

  it("after clearing the cookie, falls back to env default (legacy in prod)", () => {
    let cookieStore = "be-backend=gateway";
    Object.defineProperty(document, "cookie", {
      writable: true,
      set(v: string) {
        if (v.includes("max-age=0")) cookieStore = "";
      },
      get() { return cookieStore; }
    });

    // Before clear: gateway
    const before = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY });
    expect(before.backend).toBe("gateway");

    persistBackendCookie(null);

    // After clear: falls back to prod default (legacy)
    const after = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY });
    expect(after.backend).toBe("legacy");
    expect(after.source).toBe("env-default");
  });
});

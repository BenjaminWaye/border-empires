/**
 * Integration-level assertion: toggling the be-backend cookie mid-session is
 * reflected in the next call to selectBackend.
 *
 * Uses the injectable ctx parameter — no DOM environment required.
 */
import { describe, it, expect } from "vitest";
import { selectBackend, type BrowserCtx } from "./client-backend-selector.js";

const LEGACY = "wss://border-empires.fly.dev/ws";
const GATEWAY = "wss://border-empires-gateway.fly.dev/ws";

const prodCtx = (cookieStr = ""): BrowserCtx => ({
  hostname: "border-empires.com",
  search: "",
  cookieStr
});

describe("backend cookie mid-session toggle", () => {
  it("starts on legacy by default in prod", () => {
    const result = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY, ctx: prodCtx() });
    expect(result.backend).toBe("legacy");
  });

  it("after setting cookie to gateway, next selection is gateway", () => {
    // First call: no cookie → legacy
    const first = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY, ctx: prodCtx() });
    expect(first.backend).toBe("legacy");

    // Simulate cookie being written (e.g. via persistBackendCookie("gateway"))
    const second = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: prodCtx("be-backend=gateway")
    });
    expect(second.backend).toBe("gateway");
    expect(second.source).toBe("cookie");
    expect(second.wsUrl).toBe(GATEWAY);
  });

  it("after clearing the cookie, falls back to env default (legacy in prod)", () => {
    // With gateway cookie
    const before = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: prodCtx("be-backend=gateway")
    });
    expect(before.backend).toBe("gateway");

    // After clearing: no cookie → prod default = legacy
    const after = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: prodCtx("")
    });
    expect(after.backend).toBe("legacy");
    expect(after.source).toBe("env-default");
  });

  it("URL param takes precedence over gateway cookie on prod hostname", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: { hostname: "border-empires.com", search: "?backend=legacy", cookieStr: "be-backend=gateway" }
    });
    expect(result.backend).toBe("legacy");
    expect(result.source).toBe("url-param");
  });
});

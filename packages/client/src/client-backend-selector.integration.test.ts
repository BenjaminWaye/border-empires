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

const stagingCtx = (cookieStr = ""): BrowserCtx => ({
  hostname: "border-empires-client-staging-benjaminwayes-projects.vercel.app",
  search: "",
  cookieStr
});

const stagingCustomDomainCtx = (cookieStr = ""): BrowserCtx => ({
  hostname: "staging.borderempires.com",
  search: "",
  cookieStr
});

describe("backend cookie mid-session toggle", () => {
  it("starts on gateway by default in prod (legacy retired)", () => {
    const result = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY, ctx: prodCtx() });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(GATEWAY);
    expect(result.source).toBe("env-default");
  });

  it("explicit be-backend=legacy still selects legacy for forensic comparison", () => {
    const first = selectBackend({ legacyWsUrl: LEGACY, gatewayWsUrl: GATEWAY, ctx: prodCtx() });
    expect(first.backend).toBe("gateway");
    expect(first.source).toBe("env-default");

    const second = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: prodCtx("be-backend=legacy")
    });
    expect(second.backend).toBe("legacy");
    expect(second.source).toBe("cookie");
    expect(second.wsUrl).toBe(LEGACY);
  });

  it("after clearing the cookie, falls back to env default (gateway)", () => {
    const before = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: prodCtx("be-backend=legacy")
    });
    expect(before.backend).toBe("legacy");

    const after = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: prodCtx("")
    });
    expect(after.backend).toBe("gateway");
    expect(after.source).toBe("env-default");
    expect(after.wsUrl).toBe(GATEWAY);
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

  it("staging hostname defaults to gateway when no overrides are set", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: stagingCtx("")
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
    expect(result.wsUrl).toBe(GATEWAY);
  });

  it("staging hostname ignores legacy cookie and still resolves to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: stagingCtx("be-backend=legacy")
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
    expect(result.wsUrl).toBe(GATEWAY);
  });

  it("staging hostname ignores ?backend=legacy and still resolves to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: { hostname: "border-empires-client-staging-benjaminwayes-projects.vercel.app", search: "?backend=legacy", cookieStr: "" }
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
    expect(result.wsUrl).toBe(GATEWAY);
  });

  it("staging custom domain ignores legacy cookie and still resolves to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: stagingCustomDomainCtx("be-backend=legacy")
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
    expect(result.wsUrl).toBe(GATEWAY);
  });

  it("staging custom domain ignores ?backend=legacy and still resolves to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY,
      gatewayWsUrl: GATEWAY,
      ctx: { hostname: "staging.borderempires.com", search: "?backend=legacy", cookieStr: "" }
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
    expect(result.wsUrl).toBe(GATEWAY);
  });
});

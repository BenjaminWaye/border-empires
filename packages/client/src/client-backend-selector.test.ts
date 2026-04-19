import { describe, it, expect } from "vitest";
import { selectBackend, type BrowserCtx } from "./client-backend-selector.js";

const LEGACY_URL = "wss://border-empires.fly.dev/ws";
const GATEWAY_URL = "wss://border-empires-gateway.fly.dev/ws";
const LOCAL_LEGACY = "ws://127.0.0.1:3001/ws";
const LOCAL_GATEWAY = "ws://127.0.0.1:3101/ws";

const prodCtx = (overrides: Partial<BrowserCtx> = {}): BrowserCtx => ({
  hostname: "border-empires.com",
  search: "",
  cookieStr: "",
  ...overrides
});

const localhostCtx = (overrides: Partial<BrowserCtx> = {}): BrowserCtx => ({
  hostname: "localhost",
  search: "",
  cookieStr: "",
  ...overrides
});

describe("selectBackend — URL param", () => {
  it("?backend=gateway selects gateway and uses gatewayWsUrl", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ search: "?backend=gateway" })
    });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(GATEWAY_URL);
    expect(result.source).toBe("url-param");
  });

  it("?backend=legacy selects legacy and uses legacyWsUrl", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ search: "?backend=legacy" })
    });
    expect(result.backend).toBe("legacy");
    expect(result.wsUrl).toBe(LEGACY_URL);
    expect(result.source).toBe("url-param");
  });

  it("?backend=unknown is ignored (falls through to cookie/env)", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ search: "?backend=unknown" })
    });
    expect(result.source).not.toBe("url-param");
  });

  it("URL param overrides cookie", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ search: "?backend=gateway", cookieStr: "be-backend=legacy" })
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("url-param");
  });
});

describe("selectBackend — cookie", () => {
  it("be-backend=gateway selects gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ cookieStr: "be-backend=gateway" })
    });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(GATEWAY_URL);
    expect(result.source).toBe("cookie");
  });

  it("be-backend=legacy selects legacy", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ cookieStr: "be-backend=legacy" })
    });
    expect(result.backend).toBe("legacy");
    expect(result.wsUrl).toBe(LEGACY_URL);
    expect(result.source).toBe("cookie");
  });

  it("cookie with extra cookies parses correctly", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ cookieStr: "other=value; be-backend=gateway; another=thing" })
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("cookie");
  });

  it("invalid cookie value is ignored (falls through to env default)", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx({ cookieStr: "be-backend=invalid" })
    });
    expect(result.source).toBe("env-default");
  });
});

describe("selectBackend — env default", () => {
  it("prod hostname with no overrides defaults to legacy", () => {
    const result = selectBackend({
      legacyWsUrl: LEGACY_URL,
      gatewayWsUrl: GATEWAY_URL,
      ctx: prodCtx()
    });
    expect(result.backend).toBe("legacy");
    expect(result.wsUrl).toBe(LEGACY_URL);
    expect(result.source).toBe("env-default");
  });

  it("localhost defaults to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LOCAL_LEGACY,
      gatewayWsUrl: LOCAL_GATEWAY,
      ctx: localhostCtx()
    });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(LOCAL_GATEWAY);
    expect(result.source).toBe("env-default");
  });

  it("127.0.0.1 defaults to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LOCAL_LEGACY,
      gatewayWsUrl: LOCAL_GATEWAY,
      ctx: { hostname: "127.0.0.1", search: "", cookieStr: "" }
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
  });

  it("0.0.0.0 defaults to gateway", () => {
    const result = selectBackend({
      legacyWsUrl: LOCAL_LEGACY,
      gatewayWsUrl: LOCAL_GATEWAY,
      ctx: { hostname: "0.0.0.0", search: "", cookieStr: "" }
    });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
  });
});

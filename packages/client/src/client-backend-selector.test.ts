import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { selectBackend, persistBackendCookie } from "./client-backend-selector.js";

const LEGACY_URL = "wss://border-empires.fly.dev/ws";
const GATEWAY_URL = "wss://border-empires-gateway.fly.dev/ws";
const LOCAL_LEGACY = "ws://127.0.0.1:3001/ws";
const LOCAL_GATEWAY = "ws://127.0.0.1:3101/ws";

function mockWindow(opts: { hostname: string; search: string }) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { hostname: opts.hostname, search: opts.search }
  });
}

function setCookie(value: string) {
  Object.defineProperty(document, "cookie", {
    writable: true,
    value
  });
}

beforeEach(() => {
  mockWindow({ hostname: "border-empires.com", search: "" });
  setCookie("");
});

describe("selectBackend — URL param", () => {
  it("?backend=gateway selects gateway and uses gatewayWsUrl", () => {
    mockWindow({ hostname: "border-empires.com", search: "?backend=gateway" });
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(GATEWAY_URL);
    expect(result.source).toBe("url-param");
  });

  it("?backend=legacy selects legacy and uses legacyWsUrl", () => {
    mockWindow({ hostname: "border-empires.com", search: "?backend=legacy" });
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("legacy");
    expect(result.wsUrl).toBe(LEGACY_URL);
    expect(result.source).toBe("url-param");
  });

  it("?backend=unknown is ignored (falls through to cookie/env)", () => {
    mockWindow({ hostname: "border-empires.com", search: "?backend=unknown" });
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.source).not.toBe("url-param");
  });

  it("URL param overrides cookie", () => {
    mockWindow({ hostname: "border-empires.com", search: "?backend=gateway" });
    setCookie("be-backend=legacy");
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("url-param");
  });
});

describe("selectBackend — cookie", () => {
  it("be-backend=gateway selects gateway", () => {
    setCookie("be-backend=gateway");
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(GATEWAY_URL);
    expect(result.source).toBe("cookie");
  });

  it("be-backend=legacy selects legacy", () => {
    setCookie("be-backend=legacy");
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("legacy");
    expect(result.wsUrl).toBe(LEGACY_URL);
    expect(result.source).toBe("cookie");
  });

  it("cookie with extra cookies parses correctly", () => {
    setCookie("other=value; be-backend=gateway; another=thing");
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("cookie");
  });

  it("invalid cookie value is ignored (falls through to env default)", () => {
    setCookie("be-backend=invalid");
    mockWindow({ hostname: "border-empires.com", search: "" });
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.source).toBe("env-default");
  });
});

describe("selectBackend — env default", () => {
  it("prod hostname with no overrides defaults to legacy", () => {
    mockWindow({ hostname: "border-empires.com", search: "" });
    const result = selectBackend({ legacyWsUrl: LEGACY_URL, gatewayWsUrl: GATEWAY_URL });
    expect(result.backend).toBe("legacy");
    expect(result.wsUrl).toBe(LEGACY_URL);
    expect(result.source).toBe("env-default");
  });

  it("localhost defaults to gateway", () => {
    mockWindow({ hostname: "localhost", search: "" });
    const result = selectBackend({ legacyWsUrl: LOCAL_LEGACY, gatewayWsUrl: LOCAL_GATEWAY });
    expect(result.backend).toBe("gateway");
    expect(result.wsUrl).toBe(LOCAL_GATEWAY);
    expect(result.source).toBe("env-default");
  });

  it("127.0.0.1 defaults to gateway", () => {
    mockWindow({ hostname: "127.0.0.1", search: "" });
    const result = selectBackend({ legacyWsUrl: LOCAL_LEGACY, gatewayWsUrl: LOCAL_GATEWAY });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
  });

  it("0.0.0.0 defaults to gateway", () => {
    mockWindow({ hostname: "0.0.0.0", search: "" });
    const result = selectBackend({ legacyWsUrl: LOCAL_LEGACY, gatewayWsUrl: LOCAL_GATEWAY });
    expect(result.backend).toBe("gateway");
    expect(result.source).toBe("env-default");
  });
});

describe("persistBackendCookie", () => {
  it("writes a cookie with a long max-age when setting a choice", () => {
    const cookieParts: string[] = [];
    Object.defineProperty(document, "cookie", {
      writable: true,
      set(v: string) { cookieParts.push(v); },
      get() { return ""; }
    });
    persistBackendCookie("gateway");
    const written = cookieParts.find((c) => c.startsWith("be-backend=gateway"));
    expect(written).toBeDefined();
    expect(written).toContain("max-age=31536000");
  });

  it("clears the cookie when called with null", () => {
    const cookieParts: string[] = [];
    Object.defineProperty(document, "cookie", {
      writable: true,
      set(v: string) { cookieParts.push(v); },
      get() { return ""; }
    });
    persistBackendCookie(null);
    const written = cookieParts.find((c) => c.startsWith("be-backend="));
    expect(written).toContain("max-age=0");
  });
});

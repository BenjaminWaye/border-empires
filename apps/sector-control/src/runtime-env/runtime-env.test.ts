import { describe, expect, it } from "vitest";

import { parseSectorControlRuntimeEnv } from "./runtime-env.js";

const base = { HOSTING_SQLITE_PATH: "/tmp/hosting.db", HOSTING_TICKET_PRIVATE_KEY: "QUJD" };

describe("hosting service runtime env", () => {
  it("reads defaults, with sales off", () => {
    const env = parseSectorControlRuntimeEnv(base);
    expect(env).toMatchObject({ host: "127.0.0.1", port: 3201, sqlitePath: "/tmp/hosting.db", providers: "fake", reconcileIntervalMs: 60_000 });
    expect(env.config.salesEnabled).toBe(false);
    expect(env.ticketPrivateKeyPem).toBe("-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----");
  });

  it("turns sales on only when asked to", () => {
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_SALES_ENABLED: "1" }).config.salesEnabled).toBe(true);
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_SALES_ENABLED: "true" }).config.salesEnabled).toBe(false);
  });

  it("refuses to run in production while only fake providers exist", () => {
    expect(() => parseSectorControlRuntimeEnv({ ...base, NODE_ENV: "production" })).toThrow(/cannot run in production/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_PROVIDERS: "stripe" })).toThrow(/not available yet/);
  });

  it("requires a database path and a ticket key, and rejects bad numbers", () => {
    expect(() => parseSectorControlRuntimeEnv({ HOSTING_TICKET_PRIVATE_KEY: "QUJD" })).toThrow(/HOSTING_SQLITE_PATH/);
    expect(() => parseSectorControlRuntimeEnv({ HOSTING_SQLITE_PATH: "/tmp/h.db" })).toThrow(/HOSTING_TICKET_PRIVATE_KEY/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_PORT: "abc" })).toThrow(/HOSTING_PORT/);
  });
});

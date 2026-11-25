import { describe, expect, it } from "vitest";

import { parseSectorControlRuntimeEnv } from "./runtime-env.js";

const base = { HOSTING_SQLITE_PATH: "/tmp/hosting.db", HOSTING_TICKET_PRIVATE_KEY: "QUJD" };

describe("hosting service runtime env", () => {
  it("reads defaults, with sales off", () => {
    const env = parseSectorControlRuntimeEnv(base);
    expect(env).toMatchObject({ host: "127.0.0.1", port: 3201, sqlitePath: "/tmp/hosting.db", payment: { kind: "fake" }, servers: "fake", reconcileIntervalMs: 60_000 });
    expect(env.config.salesEnabled).toBe(false);
    expect(env.ticketPrivateKeyPem).toBe("-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----");
  });

  it("turns sales on only when asked to", () => {
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_SALES_ENABLED: "1" }).config.salesEnabled).toBe(true);
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_SALES_ENABLED: "true" }).config.salesEnabled).toBe(false);
  });

  it("refuses to run in production while only fake providers exist", () => {
    expect(() => parseSectorControlRuntimeEnv({ ...base, NODE_ENV: "production" })).toThrow(/cannot run in production/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_SERVER_PROVIDER: "hetzner" })).toThrow(/not available yet/);
  });

  it("uses Stripe in test mode only, with every setting it needs", () => {
    const stripe = { ...base, HOSTING_PAYMENT_PROVIDER: "stripe-test", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", HOSTING_RETURN_ORIGIN: "https://play.borderempires.com" };
    expect(parseSectorControlRuntimeEnv(stripe).payment).toEqual({ kind: "stripe-test", secretKey: "sk_test_abc", webhookSecret: "whsec_abc", returnOrigin: "https://play.borderempires.com", taxCode: "txcd_10000000" });
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(/live key/);
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, STRIPE_SECRET_KEY: "rk_live_abc" })).toThrow(/live key/);
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, STRIPE_WEBHOOK_SECRET: "" })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, HOSTING_RETURN_ORIGIN: "https://play.borderempires.com/path" })).toThrow(/HOSTING_RETURN_ORIGIN/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_PAYMENT_PROVIDER: "stripe" })).toThrow(/not available/);
    // Still no real server provider, so still not in production.
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, NODE_ENV: "production" })).toThrow(/cannot run in production/);
  });

  it("requires a database path and a ticket key, and rejects bad numbers", () => {
    expect(() => parseSectorControlRuntimeEnv({ HOSTING_TICKET_PRIVATE_KEY: "QUJD" })).toThrow(/HOSTING_SQLITE_PATH/);
    expect(() => parseSectorControlRuntimeEnv({ HOSTING_SQLITE_PATH: "/tmp/h.db" })).toThrow(/HOSTING_TICKET_PRIVATE_KEY/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_PORT: "abc" })).toThrow(/HOSTING_PORT/);
  });
});

import { describe, expect, it } from "vitest";

import { parseSectorControlRuntimeEnv } from "./runtime-env.js";

const base = { HOSTING_SQLITE_PATH: "/tmp/hosting.db", HOSTING_TICKET_PRIVATE_KEY: "QUJD" };

describe("hosting service runtime env", () => {
  it("reads defaults, with sales off", () => {
    const env = parseSectorControlRuntimeEnv(base);
    expect(env).toMatchObject({ host: "127.0.0.1", port: 3201, sqlitePath: "/tmp/hosting.db", payment: { kind: "fake" }, servers: { kind: "fake" }, reconcileIntervalMs: 60_000 });
    expect(env.config.salesEnabled).toBe(false);
    expect(env.ticketPrivateKeyPem).toBe("-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----");
  });

  it("turns sales on only when asked to", () => {
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_SALES_ENABLED: "1" }).config.salesEnabled).toBe(true);
    expect(parseSectorControlRuntimeEnv({ ...base, HOSTING_SALES_ENABLED: "true" }).config.salesEnabled).toBe(false);
  });

  it("refuses to run in production while only fake providers exist", () => {
    expect(() => parseSectorControlRuntimeEnv({ ...base, NODE_ENV: "production" })).toThrow(/cannot run in production/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_SERVER_PROVIDER: "aws" })).toThrow(/not available/);
  });

  it("uses Stripe in test mode only, with every setting it needs", () => {
    const stripe = { ...base, HOSTING_PAYMENT_PROVIDER: "stripe-test", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", HOSTING_RETURN_ORIGIN: "https://play.borderempires.com" };
    expect(parseSectorControlRuntimeEnv(stripe).payment).toEqual({ kind: "stripe-test", secretKey: "sk_test_abc", webhookSecret: "whsec_abc", returnOrigin: "https://play.borderempires.com", taxCode: "txcd_10000000" });
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(/live key/);
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, STRIPE_SECRET_KEY: "rk_live_abc" })).toThrow(/live key/);
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, STRIPE_WEBHOOK_SECRET: "" })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, HOSTING_RETURN_ORIGIN: "https://play.borderempires.com/path" })).toThrow(/HOSTING_RETURN_ORIGIN/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_PAYMENT_PROVIDER: "stripe" })).toThrow(/not available/);
    // Still the fake server provider, so still not in production.
    expect(() => parseSectorControlRuntimeEnv({ ...stripe, NODE_ENV: "production" })).toThrow(/cannot run in production/);
  });

  it("creates servers in Hetzner only with a token and a long admin secret, and runs in production only with both real providers", () => {
    const hetzner = { ...base, HOSTING_SERVER_PROVIDER: "hetzner", HETZNER_API_TOKEN: "token", HOSTING_SECTOR_ADMIN_SECRET: "x".repeat(32) };
    expect(parseSectorControlRuntimeEnv(hetzner).servers).toEqual({
      kind: "hetzner", apiToken: "token", sectorAdminSecret: "x".repeat(32), dnsZone: "sectors.borderempires.com", serverType: "cx23",
      location: "nbg1", image: "ubuntu-24.04", githubRepo: "BenjaminWaye/border-empires", releaseUrl: "https://api.borderempires.com/__build_sha.txt"
    });
    expect(parseSectorControlRuntimeEnv({ ...hetzner, HOSTING_SECTOR_FIREWALL_ID: "42" }).servers).toMatchObject({ firewallId: 42 });
    expect(() => parseSectorControlRuntimeEnv({ ...hetzner, HETZNER_API_TOKEN: "" })).toThrow(/HETZNER_API_TOKEN/);
    expect(() => parseSectorControlRuntimeEnv({ ...hetzner, HOSTING_SECTOR_ADMIN_SECRET: "short" })).toThrow(/32 characters/);
    expect(() => parseSectorControlRuntimeEnv({ ...hetzner, HOSTING_SECTOR_DNS_ZONE: "a b" })).toThrow(/HOSTING_SECTOR_DNS_ZONE/);
    expect(() => parseSectorControlRuntimeEnv({ ...hetzner, NODE_ENV: "production" })).toThrow(/cannot run in production/);
    const both = { ...hetzner, HOSTING_PAYMENT_PROVIDER: "stripe-test", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", HOSTING_RETURN_ORIGIN: "https://staging.borderempires.com", NODE_ENV: "production" };
    expect(parseSectorControlRuntimeEnv(both).servers.kind).toBe("hetzner");
  });

  it("requires a database path and a ticket key, and rejects bad numbers", () => {
    expect(() => parseSectorControlRuntimeEnv({ HOSTING_TICKET_PRIVATE_KEY: "QUJD" })).toThrow(/HOSTING_SQLITE_PATH/);
    expect(() => parseSectorControlRuntimeEnv({ HOSTING_SQLITE_PATH: "/tmp/h.db" })).toThrow(/HOSTING_TICKET_PRIVATE_KEY/);
    expect(() => parseSectorControlRuntimeEnv({ ...base, HOSTING_PORT: "abc" })).toThrow(/HOSTING_PORT/);
  });
});

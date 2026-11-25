// Settings of the hosting service, read once at start.
//
// Payment: the in-memory fake, or Stripe in test mode. Servers: the fake only,
// until the Hetzner provider exists. The fakes take no money and create no
// servers, so the service refuses to start in production: a production
// hosting service that "sells" sectors nobody receives must be impossible to
// run by accident. Stripe live mode is not available at all yet.
import { DEFAULT_HOSTING_CONFIG, type HostingConfig } from "../hosting-service/hosting-config.js";

export type SectorControlRuntimeEnv = {
  host: string;
  port: number;
  sqlitePath: string;
  /** PEM of the Ed25519 private key that signs membership tickets. */
  ticketPrivateKeyPem: string;
  firebaseProjectId?: string;
  payment: { kind: "fake" } | { kind: "stripe-test"; secretKey: string; webhookSecret: string; returnOrigin: string; taxCode: string };
  servers: "fake";
  reconcileIntervalMs: number;
  config: HostingConfig;
};

const positiveInt = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive whole number`);
  return parsed;
};

/** Accepts the key as base64 of the PKCS#8 DER (one line, safe in an env file) or as a PEM. */
const privateKeyPem = (raw: string): string =>
  raw.includes("BEGIN") ? raw : `-----BEGIN PRIVATE KEY-----\n${raw.replace(/\s+/g, "")}\n-----END PRIVATE KEY-----`;

/** Stripe's "General - Electronically Supplied Services" until the accountant names another. */
const DEFAULT_STRIPE_TAX_CODE = "txcd_10000000";

const parsePaymentProvider = (env: NodeJS.ProcessEnv): SectorControlRuntimeEnv["payment"] => {
  const kind = (env.HOSTING_PAYMENT_PROVIDER ?? "fake").toLowerCase();
  if (kind === "fake") return { kind: "fake" };
  if (kind !== "stripe-test") throw new Error(`HOSTING_PAYMENT_PROVIDER=${kind} is not available; use "fake" or "stripe-test"`);
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const returnOrigin = (env.HOSTING_RETURN_ORIGIN ?? "").trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required for HOSTING_PAYMENT_PROVIDER=stripe-test");
  if (/^(sk|rk)_live_/.test(secretKey)) throw new Error("STRIPE_SECRET_KEY is a live key; only Stripe test mode is available");
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is required for HOSTING_PAYMENT_PROVIDER=stripe-test");
  if (!/^https?:\/\/[^/\s]+$/.test(returnOrigin)) throw new Error("HOSTING_RETURN_ORIGIN must be an origin such as https://play.borderempires.com");
  return { kind: "stripe-test", secretKey, webhookSecret, returnOrigin, taxCode: (env.STRIPE_TAX_CODE ?? "").trim() || DEFAULT_STRIPE_TAX_CODE };
};

export const parseSectorControlRuntimeEnv = (env: NodeJS.ProcessEnv): SectorControlRuntimeEnv => {
  const nodeEnv = (env.NODE_ENV ?? "").toLowerCase();
  const servers = (env.HOSTING_SERVER_PROVIDER ?? "fake").toLowerCase();
  if (servers !== "fake") throw new Error(`HOSTING_SERVER_PROVIDER=${servers} is not available yet; only "fake" exists`);
  const payment = parsePaymentProvider(env);
  if (nodeEnv === "production") throw new Error("the hosting service has no real payment or server provider yet and cannot run in production");
  const sqlitePath = (env.HOSTING_SQLITE_PATH ?? "").trim();
  if (!sqlitePath) throw new Error("HOSTING_SQLITE_PATH is required");
  const ticketKey = (env.HOSTING_TICKET_PRIVATE_KEY ?? "").trim();
  if (!ticketKey) throw new Error("HOSTING_TICKET_PRIVATE_KEY is required");
  const firebaseProjectId = (env.HOSTING_FIREBASE_PROJECT_ID ?? env.FIREBASE_PROJECT_ID ?? "").trim();
  return {
    host: env.HOSTING_HOST ?? "127.0.0.1",
    port: positiveInt("HOSTING_PORT", env.HOSTING_PORT, 3201),
    sqlitePath,
    ticketPrivateKeyPem: privateKeyPem(ticketKey),
    ...(firebaseProjectId ? { firebaseProjectId } : {}),
    payment,
    servers: "fake",
    reconcileIntervalMs: positiveInt("HOSTING_RECONCILE_INTERVAL_MS", env.HOSTING_RECONCILE_INTERVAL_MS, 60_000),
    // Sales stay off unless switched on explicitly (the kill switch, plan section 11).
    config: { ...DEFAULT_HOSTING_CONFIG, salesEnabled: env.HOSTING_SALES_ENABLED === "1" }
  };
};

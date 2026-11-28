// Settings of the hosting service, read once at start.
//
// Payment: the in-memory fake, or Stripe in test mode. Servers: the fake, or
// Hetzner. The fakes take no money and create no servers, so the service
// refuses to start in production with either of them: a production hosting
// service that "sells" sectors nobody receives must be impossible to run by
// accident. Stripe live mode is not available at all yet.
import { DEFAULT_HOSTING_CONFIG, type HostingConfig } from "../hosting-service/hosting-config.js";
import { parseServerProviderEnv, type ServerProviderEnv } from "./server-provider-env.js";

export type SectorControlRuntimeEnv = {
  host: string;
  port: number;
  sqlitePath: string;
  /** PEM of the Ed25519 private key that signs membership tickets. */
  ticketPrivateKeyPem: string;
  firebaseProjectId?: string;
  payment: { kind: "fake" } | { kind: "stripe-test"; secretKey: string; webhookSecret: string; returnOrigin: string; taxCode: string };
  servers: ServerProviderEnv;
  reconcileIntervalMs: number;
  config: HostingConfig;
  email: HostingEmailEnv;
};

/**
 * Player emails (plan step 8c). Without a Resend key the emails are written
 * to the outbox and wait there; with one they are sent, so a reply address
 * and the web client's address are then required, since every email invites
 * a reply and links to My sectors.
 */
export type HostingEmailEnv = { resendApiKey?: string; from: string; replyTo?: string; appUrl: string; termsHtmlPath?: string };

const DEFAULT_EMAIL_FROM = "Border Empires <hosting@borderempires.com>";
const DEFAULT_APP_URL = "https://play.borderempires.com";

const parseEmailEnv = (env: NodeJS.ProcessEnv): HostingEmailEnv => {
  const resendApiKey = (env.HOSTING_EMAIL_RESEND_API_KEY ?? "").trim();
  const replyTo = (env.HOSTING_EMAIL_REPLY_TO ?? "").trim();
  const appUrl = (env.HOSTING_APP_URL ?? env.HOSTING_RETURN_ORIGIN ?? "").trim();
  if (resendApiKey && !replyTo) throw new Error("HOSTING_EMAIL_REPLY_TO is required with HOSTING_EMAIL_RESEND_API_KEY: every email invites a reply");
  if (resendApiKey && !appUrl) throw new Error("HOSTING_APP_URL is required with HOSTING_EMAIL_RESEND_API_KEY: every email links to My sectors");
  if (appUrl && !/^https?:\/\/[^\s]+$/.test(appUrl)) throw new Error("HOSTING_APP_URL must be a URL such as https://play.borderempires.com");
  if (resendApiKey && !appUrl.startsWith("https://")) throw new Error("HOSTING_APP_URL must use https when emails are sent");
  if (replyTo && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(replyTo)) throw new Error("HOSTING_EMAIL_REPLY_TO must be a plain email address");
  const termsHtmlPath = (env.HOSTING_TERMS_HTML_PATH ?? "").trim();
  return {
    ...(resendApiKey ? { resendApiKey } : {}),
    from: (env.HOSTING_EMAIL_FROM ?? "").trim() || DEFAULT_EMAIL_FROM,
    ...(replyTo ? { replyTo } : {}),
    appUrl: appUrl || DEFAULT_APP_URL,
    // Unset: the draft in this repository (docs/legal-drafts/purchase-terms.html), found from where the service runs.
    ...(termsHtmlPath ? { termsHtmlPath } : {})
  };
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
  const servers = parseServerProviderEnv(env);
  const payment = parsePaymentProvider(env);
  if (nodeEnv === "production" && (servers.kind === "fake" || payment.kind === "fake")) {
    throw new Error("the hosting service cannot run in production with a fake payment or server provider");
  }
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
    servers,
    reconcileIntervalMs: positiveInt("HOSTING_RECONCILE_INTERVAL_MS", env.HOSTING_RECONCILE_INTERVAL_MS, 60_000),
    // Sales stay off unless switched on explicitly (the kill switch, plan section 11).
    config: { ...DEFAULT_HOSTING_CONFIG, salesEnabled: env.HOSTING_SALES_ENABLED === "1" },
    email: parseEmailEnv(env)
  };
};

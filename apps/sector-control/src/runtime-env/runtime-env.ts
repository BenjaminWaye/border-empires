// Settings of the hosting service, read once at start.
//
// Until the Stripe and Hetzner providers exist, the only providers are the
// in-memory fakes. They take no money and create no servers, so the service
// refuses to start with them in production: a production hosting service that
// "sells" sectors nobody receives must be impossible to run by accident.
import { DEFAULT_HOSTING_CONFIG, type HostingConfig } from "../hosting-service/hosting-config.js";

export type SectorControlRuntimeEnv = {
  host: string;
  port: number;
  sqlitePath: string;
  /** PEM of the Ed25519 private key that signs membership tickets. */
  ticketPrivateKeyPem: string;
  firebaseProjectId?: string;
  providers: "fake";
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

export const parseSectorControlRuntimeEnv = (env: NodeJS.ProcessEnv): SectorControlRuntimeEnv => {
  const nodeEnv = (env.NODE_ENV ?? "").toLowerCase();
  const providers = (env.HOSTING_PROVIDERS ?? "fake").toLowerCase();
  if (providers !== "fake") throw new Error(`HOSTING_PROVIDERS=${providers} is not available yet; only "fake" exists`);
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
    providers: "fake",
    reconcileIntervalMs: positiveInt("HOSTING_RECONCILE_INTERVAL_MS", env.HOSTING_RECONCILE_INTERVAL_MS, 60_000),
    // Sales stay off unless switched on explicitly (the kill switch, plan section 11).
    config: { ...DEFAULT_HOSTING_CONFIG, salesEnabled: env.HOSTING_SALES_ENABLED === "1" }
  };
};

// Short-lived, read-only "agent tokens" for the /admin/* diagnostic endpoints.
//
// The admin signs in with Google on the /admin page (play/staging), mints one
// here, and hands it to a coding agent (e.g. saved as a network secret for
// api.borderempires.com). The agent then sends it as `Authorization: Bearer
// <token>`. This exists because neither the static ADMIN_API_TOKEN (root-only
// on the server) nor a Firebase ID token (1h, browser-bound) is something the
// admin can fetch from a phone and give away safely.
//
// Format: `bea1.<expiresAtMs>.<nonce>.<sig>`, sig = HMAC-SHA256 over the
// first three parts. The signing key is derived from ADMIN_API_TOKEN, so:
//   - no new server secret or deploy config is needed;
//   - rotating ADMIN_API_TOKEN revokes every token ever minted;
//   - a deployment without ADMIN_API_TOKEN can neither mint nor accept them.
// Staging and production are kept apart only by having different
// ADMIN_API_TOKEN values -- never copy one environment's secret to the other.
//
// Agent tokens are accepted only by the read-only check
// (adminRequestAuthorized), never by the static-only check that guards
// destructive endpoints, and they cannot mint further tokens.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "bea1";
const KEY_LABEL = "border-empires/admin-agent-token/v1";

/** Lifetimes the /admin page offers. Anything else is refused at mint time. */
export const ADMIN_AGENT_TOKEN_TTL_HOURS = [1, 24, 168, 720] as const;
export const DEFAULT_ADMIN_AGENT_TOKEN_TTL_HOURS = 24;
const MAX_TTL_MS = Math.max(...ADMIN_AGENT_TOKEN_TTL_HOURS) * 60 * 60 * 1000;
/** A Google sign-in older than this can't mint (see createAdminIdTokenCheck's maxAuthAgeMs). */
export const ADMIN_AGENT_TOKEN_MAX_SIGN_IN_AGE_MS = 10 * 60 * 1000;

export type AdminAgentTokens = {
  /** False when ADMIN_API_TOKEN is unset: nothing can be minted or verified. */
  enabled: boolean;
  mint: (ttlHours: number, now?: number) => { token: string; expiresAt: number; nonce: string } | undefined;
  verify: (token: string, now?: number) => boolean;
};

export const createAdminAgentTokens = (adminApiToken: string | undefined): AdminAgentTokens => {
  const key = adminApiToken ? createHmac("sha256", adminApiToken).update(KEY_LABEL).digest() : undefined;
  const sign = (payload: string): Buffer => createHmac("sha256", key!).update(payload).digest();

  const mint: AdminAgentTokens["mint"] = (ttlHours, now = Date.now()) => {
    if (!key || !(ADMIN_AGENT_TOKEN_TTL_HOURS as readonly number[]).includes(ttlHours)) return undefined;
    const expiresAt = now + ttlHours * 60 * 60 * 1000;
    const nonce = randomBytes(9).toString("base64url");
    const payload = `${PREFIX}.${expiresAt}.${nonce}`;
    return { token: `${payload}.${sign(payload).toString("base64url")}`, expiresAt, nonce };
  };

  const verify: AdminAgentTokens["verify"] = (token, now = Date.now()) => {
    if (!key) return false;
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== PREFIX) return false;
    const expiresAt = Number(parts[1]);
    // The upper bound rejects a forged far-future expiry even if the signature
    // check were ever weakened; real tokens never exceed the longest TTL.
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > MAX_TTL_MS) return false;
    // Compare the canonical encodings, not decoded bytes: Node's base64url
    // decoder skips invalid characters, so `<sig>!!` would decode to the same
    // bytes and a token would have many accepted spellings.
    const given = Buffer.from(parts[3]!);
    const expected = Buffer.from(sign(parts.slice(0, 3).join(".")).toString("base64url"));
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  return { enabled: Boolean(key), mint, verify };
};

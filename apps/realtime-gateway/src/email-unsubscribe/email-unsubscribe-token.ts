import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailNotificationCategory } from "../player-profile-store/player-profile-store.js";

// Signed, login-free unsubscribe links for gameplay emails. The token is an
// HMAC of the recipient's playerId only (not the category), so one link can
// switch off either the email's own category or every gameplay email -- the
// confirmation page offers both. Tokens never expire: unsubscribe links in
// old emails must keep working (CAN-SPAM / Gmail bulk-sender rules), and the
// worst a leaked link allows is turning *off* that player's emails.

export const EMAIL_UNSUBSCRIBE_PATH = "/email/unsubscribe";
export type EmailUnsubscribeScope = EmailNotificationCategory | "all";

const TOKEN_DOMAIN = "border-empires-email-unsubscribe-v1";

export type EmailUnsubscribeSigner = {
  sign: (playerId: string) => string;
  verify: (playerId: string, token: string) => boolean;
  url: (appUrl: string, playerId: string, scope: EmailUnsubscribeScope) => string;
};

export const createEmailUnsubscribeSigner = (secret: string): EmailUnsubscribeSigner => {
  const sign = (playerId: string): string =>
    createHmac("sha256", secret).update(`${TOKEN_DOMAIN}:${playerId}`).digest("base64url");
  return {
    sign,
    verify(playerId, token) {
      if (!playerId || !token) return false;
      const expected = Buffer.from(sign(playerId));
      const actual = Buffer.from(token);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },
    url(appUrl, playerId, scope) {
      const params = new URLSearchParams({ p: playerId, c: scope, t: sign(playerId) });
      return `${appUrl.replace(/\/+$/, "")}${EMAIL_UNSUBSCRIBE_PATH}?${params.toString()}`;
    }
  };
};

/**
 * The signing secret: a dedicated GATEWAY_EMAIL_UNSUBSCRIBE_SECRET when set,
 * otherwise derived from the Resend API key that is already required to send
 * any email at all (so links work on existing deploys without new config).
 * Rotating that key without setting a dedicated secret invalidates old links.
 */
export const resolveEmailUnsubscribeSecret = (input: { unsubscribeSecret?: string; resendApiKey?: string }): string | undefined => {
  const dedicated = input.unsubscribeSecret?.trim();
  if (dedicated) return dedicated;
  const apiKey = input.resendApiKey?.trim();
  return apiKey ? createHmac("sha256", apiKey).update(TOKEN_DOMAIN).digest("hex") : undefined;
};

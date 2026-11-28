import { logEvent } from "firebase/analytics";
import { getAdditionalUserInfo, type UserCredential } from "firebase/auth";
import type { AnalyticsSource } from "../client-analytics-consent/client-analytics-consent.js";
import { readAcquisitionParams } from "./client-auth-flow-acquisition.js";
import { reportAcquisitionSignUp } from "../client-acquisition-funnel/client-acquisition-funnel.js";

export type SignUpMethod = "password" | "google.com" | "apple.com" | "oidc.twitch" | "oidc.discord" | "email-link";

// GA4 conversion event for the acquisition funnel (landing -> sign_up),
// fired once per new account regardless of which sign-in method created it.
// Includes utm_* / referrer params so we can see where sign-ups come from.
// Never throws: analytics is best-effort and must not block auth.
export const logSignUpConversion = (source: AnalyticsSource, method: SignUpMethod): void => {
  // Also the last step of the /admin/players/insights sign-up funnel, which
  // doesn't depend on GA (or ad blockers) being available.
  reportAcquisitionSignUp(method);
  // Read now: undefined without the player's consent (client-analytics-consent.ts).
  const analytics = source();
  if (!analytics) return;
  try {
    logEvent(analytics, "sign_up", { method, ...readAcquisitionParams() });
  } catch {
    // Analytics unavailable (e.g. blocked by an ad/privacy blocker) — ignore.
  }
};

export const logSignUpIfNewUser = (
  source: AnalyticsSource,
  credential: UserCredential,
  method: Exclude<SignUpMethod, "password">
): void => {
  if (getAdditionalUserInfo(credential)?.isNewUser) logSignUpConversion(source, method);
};

// GA4: a visitor started a guest session (an anonymous Firebase account). Only
// a brand-new anonymous account counts; a returning guest is not a new start.
// Deliberately not "sign_up": that event means a real account (see
// logSignUpConversion). Includes utm_* / referrer params like sign_up does.
export const logGuestStart = (source: AnalyticsSource, credential: UserCredential): void => {
  const analytics = source();
  if (!analytics || !getAdditionalUserInfo(credential)?.isNewUser) return;
  try {
    logEvent(analytics, "guest_start", { ...readAcquisitionParams() });
  } catch {
    // Analytics unavailable (e.g. blocked by an ad/privacy blocker) — ignore.
  }
};

// GA4: a guest saved their empire to a real account. Logged together with
// sign_up (the moment a real account comes into existence), which the caller
// does not do for a link because getAdditionalUserInfo().isNewUser is false.
export const logGuestUpgrade = (source: AnalyticsSource, method: Exclude<SignUpMethod, "password">): void => {
  logSignUpConversion(source, method);
  const analytics = source();
  if (!analytics) return;
  try {
    logEvent(analytics, "guest_upgrade", { method, ...readAcquisitionParams() });
  } catch {
    // Analytics unavailable (e.g. blocked by an ad/privacy blocker) — ignore.
  }
};

// GA4: the account a guest tried to save to already has an empire.
export const logGuestUpgradeConflict = (source: AnalyticsSource, method: Exclude<SignUpMethod, "password">): void => {
  const analytics = source();
  if (!analytics) return;
  try {
    logEvent(analytics, "guest_upgrade_conflict", { method });
  } catch {
    // Analytics unavailable (e.g. blocked by an ad/privacy blocker) — ignore.
  }
};

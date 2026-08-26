import { logEvent } from "firebase/analytics";
import { getAdditionalUserInfo, type UserCredential } from "firebase/auth";
import type { Analytics } from "firebase/analytics";
import { readAcquisitionParams } from "./client-auth-flow-acquisition.js";

export type SignUpMethod = "password" | "google.com" | "email-link";

// GA4 conversion event for the acquisition funnel (landing -> sign_up),
// fired once per new account regardless of which sign-in method created it.
// Includes utm_* / referrer params so we can see where sign-ups come from.
// Never throws: analytics is best-effort and must not block auth.
export const logSignUpConversion = (analytics: Analytics | undefined, method: SignUpMethod): void => {
  if (!analytics) return;
  try {
    logEvent(analytics, "sign_up", { method, ...readAcquisitionParams() });
  } catch {
    // Analytics unavailable (e.g. blocked by an ad/privacy blocker) — ignore.
  }
};

export const logSignUpIfNewUser = (
  analytics: Analytics | undefined,
  credential: UserCredential,
  method: Extract<SignUpMethod, "google.com" | "email-link">
): void => {
  if (getAdditionalUserInfo(credential)?.isNewUser) logSignUpConversion(analytics, method);
};

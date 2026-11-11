import { Capacitor } from "@capacitor/core";
import { signInWithPopup, type Auth, type AuthProvider, type User, type UserCredential } from "firebase/auth";
import type { Analytics } from "firebase/analytics";
import {
  detectInAppBrowserName,
  inAppBrowserSsoSignInMessage,
  isMissingInitialStateError,
  missingInitialStateMessage
} from "../client-inapp-browser/client-inapp-browser.js";
import { logSignUpIfNewUser, type SignUpMethod } from "./client-auth-flow-analytics.js";

// Firebase provider ids for the popup sign-in buttons. Twitch and Discord have
// no built-in Firebase provider, so each is a custom OpenID Connect provider
// whose id is "oidc." + the provider name configured in the Firebase console.
export const TWITCH_PROVIDER_ID = "oidc.twitch";
export const DISCORD_PROVIDER_ID = "oidc.discord";

export const APPLE_PROVIDER_ID = "apple.com";

export type SsoProvider = {
  /** Web popup provider. Native builds sign in through the native SDK instead and may omit it. */
  provider?: AuthProvider | undefined;
  label: "Google" | "Apple" | "Twitch" | "Discord";
  method: Extract<SignUpMethod, "google.com" | "apple.com" | "oidc.twitch" | "oidc.discord">;
};

export type SsoSignInDeps = {
  firebaseAuth: Auth | undefined;
  /** Defaults to Capacitor's platform check; injectable for tests. */
  isNative?: () => boolean;
  analytics: Analytics | undefined;
  userAgent: () => string | undefined;
  clearEmailLinkSentTo: () => void;
  setAuthBusy: (busy: boolean) => void;
  setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  syncAuthOverlay: () => void;
};

// Firebase rejects a provider sign-in whose email already belongs to an
// account created with a different provider (the console's "one account per
// email" setting), e.g. a Twitch login sharing a Google account's address.
const ACCOUNT_EXISTS_CODE = "auth/account-exists-with-different-credential";

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;

export const ssoSignInErrorMessage = (error: unknown, label: SsoProvider["label"]): string => {
  if (errorCode(error) === ACCOUNT_EXISTS_CODE) {
    return `That ${label} account's email is already used by another sign-in method. Sign in the way you did before.`;
  }
  const rawMessage = error instanceof Error ? error.message : `${label} sign-in failed.`;
  return isMissingInitialStateError(rawMessage) ? missingInitialStateMessage(label) : rawMessage;
};

const signInWith = async (auth: Auth, sso: SsoProvider, native: boolean): Promise<UserCredential> => {
  if (native) {
    // Loaded on demand so the web bundle never pulls in the native plugin.
    const { signInWithNativeSso } = await import("../client-native-sso/client-native-sso.js");
    return signInWithNativeSso(auth, sso.method);
  }
  if (!sso.provider) throw new Error(`${sso.label} sign-in isn't available here.`);
  return signInWithPopup(auth, sso.provider);
};

export const createSsoSignInHandler =
  (deps: SsoSignInDeps, sso: SsoProvider | undefined) =>
  async (): Promise<void> => {
    const { firebaseAuth } = deps;
    if (!firebaseAuth || !sso) return;
    const native = (deps.isNative ?? (() => Capacitor.isNativePlatform()))();
    if (!native && !sso.provider) return;
    const userAgent = native ? undefined : deps.userAgent();
    const inAppBrowserName = userAgent ? detectInAppBrowserName(userAgent) : undefined;
    if (inAppBrowserName) {
      deps.setAuthStatus(inAppBrowserSsoSignInMessage(inAppBrowserName, sso.label), "error");
      deps.syncAuthOverlay();
      return;
    }
    deps.clearEmailLinkSentTo();
    deps.setAuthBusy(true);
    deps.setAuthStatus(`Opening ${sso.label} sign-in...`);
    deps.syncAuthOverlay();
    let authSucceeded = false;
    try {
      const cred = await signInWith(firebaseAuth, sso, native);
      logSignUpIfNewUser(deps.analytics, cred, sso.method);
      authSucceeded = true;
      deps.setAuthStatus(`${sso.label} sign-in complete. Authorizing empire...`);
    } catch (error) {
      if (error instanceof Error && error.name === "NativeSsoCancelledError") deps.setAuthStatus("");
      else deps.setAuthStatus(ssoSignInErrorMessage(error, sso.label), "error");
    } finally {
      if (!authSucceeded) deps.setAuthBusy(false);
      deps.syncAuthOverlay();
    }
  };

// Names the provider a signed-in user came through, for the "Loading your
// ... session" busy copy, which used to say "Google" for every login.
export const signInProviderLabel = (user: Pick<User, "providerData">): string => {
  // Defensive: partial User objects (test fakes) can omit providerData.
  const providerIds = (user.providerData ?? []).map((info) => info.providerId);
  if (providerIds.includes(TWITCH_PROVIDER_ID)) return "Twitch";
  if (providerIds.includes(DISCORD_PROVIDER_ID)) return "Discord";
  if (providerIds.includes(APPLE_PROVIDER_ID)) return "Apple";
  if (providerIds.includes("google.com")) return "Google";
  return "account";
};

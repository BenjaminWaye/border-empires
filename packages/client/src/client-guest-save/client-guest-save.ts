import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  linkWithPopup,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink,
  type Auth,
  type AuthCredential,
  type AuthProvider,
  type UserCredential
} from "firebase/auth";
import type { Analytics } from "firebase/analytics";

import { logGuestUpgrade, logGuestUpgradeConflict } from "../client-auth-flow/client-auth-flow-analytics.js";
import { safeLocalStorageSet } from "../client-safe-storage/client-safe-storage.js";
import { detectInAppBrowserName } from "../client-inapp-browser/client-inapp-browser.js";

// Where the email address of a pending email-link sign-in is remembered, so
// the same browser can finish it when the link is opened.
export const EMAIL_LINK_STORAGE_KEY = "be_auth_email_link";

export type SaveMethod = "google.com" | "oidc.twitch" | "email-link";

export type SaveView =
  | { kind: "idle" }
  | { kind: "busy"; message: string }
  | { kind: "email-sent"; email: string }
  | { kind: "conflict"; method: SaveMethod }
  | { kind: "error"; message: string };

// What "Switch to that empire" does once a link hit an account that already
// exists. Kept because a Google/Twitch credential and an email link are each
// usable only once, and the page URL that carried the email link is cleaned up.
type PendingSwitch = { kind: "provider"; credential: AuthCredential } | { kind: "email-link"; email: string; href: string };

type ProviderSaveMethod = Exclude<SaveMethod, "email-link">;

export const saveMethodLabel = (method: ProviderSaveMethod): string => (method === "oidc.twitch" ? "Twitch" : "Google");

export type GuestSaveDeps = {
  firebaseAuth: Auth | undefined;
  googleProvider: GoogleAuthProvider | undefined;
  twitchProvider?: OAuthProvider | undefined;
  analytics: Analytics | undefined;
  reload: () => void;
  userAgent: () => string;
  pageUrl: () => string;
};

export type GuestSaveController = {
  getView: () => SaveView;
  subscribe: (listener: () => void) => () => void;
  /** Non-empty when saving cannot work in this browser; the reason to show. */
  unavailableReason: () => string | undefined;
  saveWithGoogle: () => Promise<void>;
  saveWithTwitch: () => Promise<void>;
  saveWithEmail: (emailRaw: string) => Promise<void>;
  switchToExisting: () => Promise<void>;
  keepPlayingAsGuest: () => void;
  handleEmailLinkResult: (result: EmailLinkResult, email: string, href: string) => Promise<void>;
};

const errorCode = (error: unknown): string => (typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "");
const errorText = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);
const isConflictCode = (code: string): boolean => code === "auth/credential-already-in-use" || code === "auth/email-already-in-use";

// A guest empire belongs to the browser that started it: Firebase keeps the
// anonymous session in that browser's storage. In an in-app browser Google
// sign-in is blocked and an emailed link opens in a different browser that
// cannot see the guest, so it would quietly create a second, empty account.
export const inAppBrowserSaveMessage = (appName: string): string =>
  `A guest empire can only be saved from the browser it was started in, and sign-in doesn't work inside the ${appName} in-app browser. You can keep playing here as a guest.`;

const pageUrlWithoutQuery = (pageUrl: string): string => {
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = "";
  return url.toString();
};

export type EmailLinkResult =
  | { kind: "signed-in"; credential: UserCredential }
  | { kind: "linked"; credential: UserCredential }
  | { kind: "conflict" };

// Completes an email sign-in link. For a guest it must LINK the email to the
// guest account: signing in would replace the guest session and strand the
// empire. At page load the persisted anonymous user is not restored yet, so
// wait for the auth state before looking at currentUser.
export const linkOrSignInWithEmailLink = async (auth: Auth, email: string, href: string): Promise<EmailLinkResult> => {
  await auth.authStateReady?.();
  const user = auth.currentUser;
  if (user?.isAnonymous) {
    try {
      const credential = await linkWithCredential(user, EmailAuthProvider.credentialWithLink(email, href));
      return { kind: "linked", credential };
    } catch (error) {
      if (isConflictCode(errorCode(error))) return { kind: "conflict" };
      throw error;
    }
  }
  return { kind: "signed-in", credential: await signInWithEmailLink(auth, email, href) };
};

export const createGuestSaveController = (deps: GuestSaveDeps): GuestSaveController => {
  let view: SaveView = { kind: "idle" };
  let pending: PendingSwitch | undefined;
  const listeners = new Set<() => void>();
  const setView = (next: SaveView): void => {
    view = next;
    for (const listener of [...listeners]) listener();
  };

  const unavailableReason = (): string | undefined => {
    const appName = detectInAppBrowserName(deps.userAgent());
    return appName ? inAppBrowserSaveMessage(appName) : undefined;
  };

  // Only ever acts on a guest: nothing here may touch a real account.
  const currentGuest = () => (deps.firebaseAuth?.currentUser?.isAnonymous ? deps.firebaseAuth.currentUser : undefined);

  // The link worked and the uid is unchanged. The token still describes the
  // guest until it is refreshed, so refresh it and reload: the reload sends a
  // fresh AUTH, the gateway sees a real account, and the setup step asks for a
  // real name and colour.
  const finishUpgrade = async (method: SaveMethod): Promise<void> => {
    setView({ kind: "busy", message: "Saving your empire..." });
    try {
      await deps.firebaseAuth?.currentUser?.getIdToken(true);
    } catch {
      // The reload fetches a fresh token anyway.
    }
    logGuestUpgrade(deps.analytics, method);
    deps.reload();
  };

  const offerSwitch = (method: SaveMethod, target: PendingSwitch): void => {
    pending = target;
    logGuestUpgradeConflict(deps.analytics, method);
    setView({ kind: "conflict", method });
  };

  const saveWithProvider = async (method: ProviderSaveMethod): Promise<void> => {
    const label = saveMethodLabel(method);
    const provider: AuthProvider | undefined = method === "oidc.twitch" ? deps.twitchProvider : deps.googleProvider;
    const user = currentGuest();
    const blocked = unavailableReason();
    if (blocked) return setView({ kind: "error", message: blocked });
    if (!user || !provider) return setView({ kind: "error", message: `${label} sign-in isn't available right now.` });
    setView({ kind: "busy", message: `Opening ${label}...` });
    try {
      await linkWithPopup(user, provider);
      await finishUpgrade(method);
    } catch (error) {
      const code = errorCode(error);
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return setView({ kind: "idle" });
      if (isConflictCode(code)) {
        const credential = method === "oidc.twitch" ? OAuthProvider.credentialFromError(error as never) : GoogleAuthProvider.credentialFromError(error as never);
        if (credential) return offerSwitch(method, { kind: "provider", credential });
        // Nothing reusable to sign in with: say what happened instead of showing a raw Firebase code.
        return setView({ kind: "error", message: `That ${label} account already has an empire. Use a different account, or keep playing as a guest.` });
      }
      setView({ kind: "error", message: errorText(error, `Could not save your empire with ${label}.`) });
    }
  };

  return {
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unavailableReason,

    saveWithGoogle: () => saveWithProvider("google.com"),
    saveWithTwitch: () => saveWithProvider("oidc.twitch"),

    async saveWithEmail(emailRaw) {
      const email = emailRaw.trim();
      const blocked = unavailableReason();
      if (blocked) return setView({ kind: "error", message: blocked });
      if (!currentGuest() || !deps.firebaseAuth) return setView({ kind: "error", message: "Sign-in isn't available right now." });
      if (!/^\S+@\S+\.\S+$/.test(email)) return setView({ kind: "error", message: "Enter a valid email address." });
      setView({ kind: "busy", message: "Sending your link..." });
      try {
        await sendSignInLinkToEmail(deps.firebaseAuth, email, { url: pageUrlWithoutQuery(deps.pageUrl()), handleCodeInApp: true });
        safeLocalStorageSet(EMAIL_LINK_STORAGE_KEY, email);
        setView({ kind: "email-sent", email });
      } catch (error) {
        setView({ kind: "error", message: errorText(error, "Could not send the email link.") });
      }
    },

    async handleEmailLinkResult(result, email, href) {
      if (result.kind === "conflict") return offerSwitch("email-link", { kind: "email-link", email, href });
      if (result.kind === "linked") await finishUpgrade("email-link");
    },

    async switchToExisting() {
      const target = pending;
      if (!target || !deps.firebaseAuth) return;
      setView({ kind: "busy", message: "Switching to your existing empire..." });
      try {
        if (target.kind === "provider") await signInWithCredential(deps.firebaseAuth, target.credential);
        else await signInWithEmailLink(deps.firebaseAuth, target.email, target.href);
        pending = undefined;
        deps.reload();
      } catch (error) {
        setView({ kind: "error", message: errorText(error, "Could not switch accounts. Try saving again.") });
      }
    },

    keepPlayingAsGuest() {
      pending = undefined;
      setView({ kind: "idle" });
    }
  };
};

let controller: GuestSaveController | undefined;

export const initGuestSave = (deps: GuestSaveDeps): GuestSaveController => {
  controller = createGuestSaveController(deps);
  return controller;
};

export const getGuestSave = (): GuestSaveController | undefined => controller;

export const resetGuestSaveForTests = (): void => {
  controller = undefined;
};

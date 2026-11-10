import { FirebaseAuthentication, type SignInResult } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  linkWithCredential,
  OAuthProvider,
  reauthenticateWithCredential,
  signInWithCredential,
  type Auth,
  type OAuthCredential,
  type User,
  type UserCredential
} from "firebase/auth";

// Native builds cannot use the browser popup flows: the WebView blocks them and
// the provider never returns to the app. The native Firebase SDK runs each
// provider's own sign-in UI (Google account picker, Apple sheet, a system
// browser tab for Twitch/Discord), and its credential then signs in the web
// Firebase SDK, which stays the single source of truth for the game session.

export type NativeSsoMethod = "google.com" | "apple.com" | "oidc.twitch" | "oidc.discord";

/** Thrown when the player backs out of the provider's sign-in UI. */
export class NativeSsoCancelledError extends Error {
  constructor() {
    super("Sign-in cancelled.");
    this.name = "NativeSsoCancelledError";
  }
}

// Same scopes/claims as the web providers in client-app-runtime-env, so a
// native sign-in carries the same email/username claims to the gateway.
const TWITCH_CLAIMS = JSON.stringify({ id_token: { email: null, email_verified: null, preferred_username: null } });

const CANCEL_PATTERNS = [/cancel/i, /closed by the user/i, /user denied/i, /aborted/i, /no credentials available/i];

export const isNativeSsoCancellation = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return CANCEL_PATTERNS.some((pattern) => pattern.test(message) || pattern.test(code));
};

const runNativeSignIn = async (method: NativeSsoMethod): Promise<SignInResult> => {
  switch (method) {
    case "google.com":
      return FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    case "apple.com":
      return FirebaseAuthentication.signInWithApple({ skipNativeAuth: true, scopes: ["email", "name"] });
    // OIDC needs a full native sign-in: on iOS a credential-only result holds a
    // pending token instead of the ID/access tokens the web SDK needs.
    case "oidc.twitch":
      return FirebaseAuthentication.signInWithOpenIdConnect({
        skipNativeAuth: false,
        providerId: method,
        scopes: ["openid", "user:read:email"],
        customParameters: [{ key: "claims", value: TWITCH_CLAIMS }]
      });
    case "oidc.discord":
      return FirebaseAuthentication.signInWithOpenIdConnect({ skipNativeAuth: false, providerId: method, scopes: ["openid", "identify", "email"] });
  }
};

/** Converts the native SDK's result into a credential the web Firebase SDK accepts. */
export const webCredentialFromNativeResult = (method: NativeSsoMethod, result: SignInResult): OAuthCredential => {
  const native = result.credential;
  if (!native?.idToken && !native?.accessToken) throw new Error("The sign-in provider returned no credential.");
  if (method === "google.com") return GoogleAuthProvider.credential(native.idToken ?? null, native.accessToken ?? null);
  const provider = new OAuthProvider(method);
  if (method === "apple.com") {
    if (!native.idToken) throw new Error("Apple returned no identity token.");
    return provider.credential(native.nonce ? { idToken: native.idToken, rawNonce: native.nonce } : { idToken: native.idToken });
  }
  return provider.credential({
    ...(native.idToken ? { idToken: native.idToken } : {}),
    ...(native.accessToken ? { accessToken: native.accessToken } : {}),
    ...(native.nonce ? { rawNonce: native.nonce } : {})
  });
};

/** Clears the native SDK's own session so the next sign-in shows the account picker again. */
export const signOutNativeSso = async (): Promise<void> => {
  try {
    await FirebaseAuthentication.signOut();
  } catch {
    // Nothing was signed in natively (or the plugin is unavailable); the web session is what counts.
  }
};

/** Runs the provider's native sign-in UI and returns a web-SDK credential. */
export const nativeSsoCredential = async (method: NativeSsoMethod): Promise<OAuthCredential> => {
  let result: SignInResult;
  try {
    result = await runNativeSignIn(method);
  } catch (error) {
    if (isNativeSsoCancellation(error)) throw new NativeSsoCancelledError();
    throw error;
  }
  // Twitch/Discord sign in on the native layer too (their flow has no
  // skip-native mode); the web SDK session is the only one the game uses.
  if (method.startsWith("oidc.")) await signOutNativeSso();
  return webCredentialFromNativeResult(method, result);
};

export const signInWithNativeSso = async (auth: Auth, method: NativeSsoMethod): Promise<UserCredential> =>
  signInWithCredential(auth, await nativeSsoCredential(method));

export const linkWithNativeSso = async (user: User, method: NativeSsoMethod): Promise<UserCredential> =>
  linkWithCredential(user, await nativeSsoCredential(method));

export const reauthenticateWithNativeSso = async (user: User, method: NativeSsoMethod): Promise<UserCredential> =>
  reauthenticateWithCredential(user, await nativeSsoCredential(method));

// Talks to Firebase Auth's REST API directly (no firebase SDK dependency —
// this is a plain Node script, not a browser) using the same public web API
// key the real client ships with. See client-app-runtime-env.ts for the
// browser-side equivalent (email/password + Google sign-in via the SDK).

export type FirebaseAuthResult = {
  idToken: string;
  localId: string;
  email: string;
};

type FirebaseAuthErrorBody = { error?: { message?: string } };

const IDENTITY_BASE_URL = "https://identitytoolkit.googleapis.com/v1/accounts";

const callIdentityToolkit = async (
  endpoint: "signUp" | "signInWithPassword",
  apiKey: string,
  email: string,
  password: string
): Promise<FirebaseAuthResult> => {
  const response = await fetch(`${IDENTITY_BASE_URL}:${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  // An outage/proxy/rate-limit can return a non-JSON body (an HTML error
  // page, an empty 502) -- this is the first network call of every session,
  // so a raw JSON.parse throw here would surface as a cryptic
  // "Unexpected token <" instead of a clear "Firebase signUp failed: ...".
  const body = (await response.json().catch(() => ({}))) as Partial<FirebaseAuthResult> & FirebaseAuthErrorBody;
  if (!response.ok || !body.idToken || !body.localId || !body.email) {
    const message = body.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Firebase ${endpoint} failed: ${message}`);
  }
  return { idToken: body.idToken, localId: body.localId, email: body.email };
};

// Registers a brand-new player account for the bot. Firebase's public REST
// signUp endpoint needs nothing but an email/password and the project's
// public web API key — no admin credentials, no manual sign-up UI.
export const signUpBotAccount = (apiKey: string, email: string, password: string): Promise<FirebaseAuthResult> =>
  callIdentityToolkit("signUp", apiKey, email, password);

export const signInBotAccount = (apiKey: string, email: string, password: string): Promise<FirebaseAuthResult> =>
  callIdentityToolkit("signInWithPassword", apiKey, email, password);

// The gateway falls back to the email's local part as the in-game display
// name (and leaderboard name) when a Firebase account has no displayName set
// (see apps/realtime-gateway/src/auth-identity/auth-identity.ts) -- without
// this, the bot would show up as its literal email prefix instead of
// BOT_DISPLAY_NAME. One-time; the name then rides along in every future
// idToken's `name` claim, no need to call this again on every sign-in.
export const setBotDisplayName = async (apiKey: string, idToken: string, displayName: string): Promise<void> => {
  const response = await fetch(`${IDENTITY_BASE_URL}:update?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken, displayName, returnSecureToken: false })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as FirebaseAuthErrorBody;
    throw new Error(`Firebase displayName update failed: ${body.error?.message ?? `HTTP ${response.status}`}`);
  }
};

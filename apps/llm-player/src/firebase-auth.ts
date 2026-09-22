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
  const body = (await response.json()) as FirebaseAuthResult & FirebaseAuthErrorBody;
  if (!response.ok) {
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

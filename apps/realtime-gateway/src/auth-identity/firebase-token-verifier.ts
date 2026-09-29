import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

// Google's public keys for Firebase Auth ID tokens (RS256). Firebase's own
// docs specify this endpoint for verifying ID tokens without the admin SDK.
export const FIREBASE_ID_TOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// Must match VITE_FIREBASE_PROJECT_ID's default in the client
// (packages/client/src/client-app-runtime-env/client-app-runtime-env.ts).
export const DEFAULT_FIREBASE_PROJECT_ID = "border-empires";

const CLOCK_TOLERANCE_SECONDS = 30;

// isGuest is true for a Firebase anonymous-provider token that has not been
// linked to a real sign-in. Computed here, from the verified payload, rather
// than by re-decoding the raw token elsewhere -- the whole point of this
// module is that no claim is trusted before signature verification. A linked
// account always carries an email or at least one linked identity; a genuine
// anonymous account carries neither.
export type VerifiedFirebaseToken = { uid: string; email?: string; name?: string; isGuest?: boolean };

export type FirebaseTokenRejectReason =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "not_yet_valid"
  | "bad_issuer"
  | "bad_audience"
  | "missing_subject"
  | "key_fetch_failed";

// Resolves to the verified claims, or undefined when the token is not a valid,
// currently-live Firebase ID token for this project. Never throws.
export type FirebaseTokenVerifier = (token: string) => Promise<VerifiedFirebaseToken | undefined>;

export type FirebaseTokenVerifierOptions = {
  projectId?: string | undefined;
  // Injected in tests; production uses Google's remote JWKS (cached in-process,
  // refetched on an unknown `kid` with a cooldown so key rotation is picked up).
  keySet?: JWTVerifyGetKey;
  now?: () => number;
  onReject?: (reason: FirebaseTokenRejectReason) => void;
};

const rejectReasonFor = (error: unknown): FirebaseTokenRejectReason => {
  if (error instanceof errors.JWTExpired) return "expired";
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "bad_issuer";
    if (error.claim === "aud") return "bad_audience";
    if (error.claim === "nbf") return "not_yet_valid";
    return "malformed";
  }
  if (
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWKSMultipleMatchingKeys ||
    error instanceof errors.JOSEAlgNotAllowed
  ) {
    return "bad_signature";
  }
  if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) return "malformed";
  // JWKS fetch failures (network, timeout, non-200) surface as JWKSTimeout or plain errors.
  return "key_fetch_failed";
};

export const createFirebaseTokenVerifier = (options: FirebaseTokenVerifierOptions = {}): FirebaseTokenVerifier => {
  const projectId = options.projectId?.trim() || DEFAULT_FIREBASE_PROJECT_ID;
  const keySet = options.keySet ?? createRemoteJWKSet(new URL(FIREBASE_ID_TOKEN_JWKS_URL));
  const now = options.now ?? Date.now;
  const reject = (reason: FirebaseTokenRejectReason): undefined => {
    options.onReject?.(reason);
    return undefined;
  };

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ["RS256"],
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: new Date(now())
      });
      // jose has no "issued in the future" check; Firebase requires iat <= now.
      if (typeof payload.iat !== "number" || payload.iat > now() / 1000 + CLOCK_TOLERANCE_SECONDS) {
        return reject("not_yet_valid");
      }
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return reject("missing_subject");
      const verified: VerifiedFirebaseToken = { uid: payload.sub };
      // Anonymous-provider tokens carry neither email nor name; both stay optional.
      if (typeof payload.email === "string") verified.email = payload.email;
      if (typeof payload.name === "string") verified.name = payload.name;
      const firebaseClaim = payload.firebase;
      if (typeof firebaseClaim === "object" && firebaseClaim !== null) {
        const { sign_in_provider: signInProvider, identities } = firebaseClaim as { sign_in_provider?: unknown; identities?: unknown };
        const hasLinkedIdentity = typeof identities === "object" && identities !== null && Object.keys(identities).length > 0;
        if (signInProvider === "anonymous" && !verified.email && !hasLinkedIdentity) verified.isGuest = true;
      }
      return verified;
    } catch (error) {
      return reject(rejectReasonFor(error));
    }
  };
};

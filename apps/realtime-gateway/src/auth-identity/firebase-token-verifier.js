import { createRemoteJWKSet, errors, jwtVerify } from "jose";
// Google's public keys for Firebase Auth ID tokens (RS256). Firebase's own
// docs specify this endpoint for verifying ID tokens without the admin SDK.
export const FIREBASE_ID_TOKEN_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
// Must match VITE_FIREBASE_PROJECT_ID's default in the client
// (packages/client/src/client-app-runtime-env/client-app-runtime-env.ts).
export const DEFAULT_FIREBASE_PROJECT_ID = "border-empires";
const CLOCK_TOLERANCE_SECONDS = 30;
const rejectReasonFor = (error) => {
    if (error instanceof errors.JWTExpired)
        return "expired";
    if (error instanceof errors.JWTClaimValidationFailed) {
        if (error.claim === "iss")
            return "bad_issuer";
        if (error.claim === "aud")
            return "bad_audience";
        if (error.claim === "nbf")
            return "not_yet_valid";
        return "malformed";
    }
    if (error instanceof errors.JWSSignatureVerificationFailed ||
        error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JWKSMultipleMatchingKeys ||
        error instanceof errors.JOSEAlgNotAllowed) {
        return "bad_signature";
    }
    if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout))
        return "malformed";
    // JWKS fetch failures (network, timeout, non-200) surface as JWKSTimeout or plain errors.
    return "key_fetch_failed";
};
export const createFirebaseTokenVerifier = (options = {}) => {
    const projectId = options.projectId?.trim() || DEFAULT_FIREBASE_PROJECT_ID;
    const keySet = options.keySet ?? createRemoteJWKSet(new URL(FIREBASE_ID_TOKEN_JWKS_URL));
    const now = options.now ?? Date.now;
    const reject = (reason) => {
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
            if (typeof payload.sub !== "string" || payload.sub.length === 0)
                return reject("missing_subject");
            const verified = { uid: payload.sub };
            if (typeof payload.auth_time === "number" && Number.isFinite(payload.auth_time))
                verified.authTime = payload.auth_time;
            // Anonymous-provider tokens carry neither email nor name; both stay optional.
            if (typeof payload.email === "string")
                verified.email = payload.email;
            if (typeof payload.name === "string")
                verified.name = payload.name;
            if (verified.email && payload.email_verified === true)
                verified.emailVerified = true;
            const firebaseClaim = payload.firebase;
            if (typeof firebaseClaim === "object" && firebaseClaim !== null) {
                const { sign_in_provider: signInProvider, identities } = firebaseClaim;
                const hasLinkedIdentity = typeof identities === "object" && identities !== null && Object.keys(identities).length > 0;
                if (signInProvider === "anonymous" && !verified.email && !hasLinkedIdentity)
                    verified.isGuest = true;
                // A custom OIDC provider (Twitch: oidc.twitch) can pass through an address
                // its user never verified. reconcileGatewayAuthBinding reuses an existing
                // player on an email match, and stores the email on a binding that has
                // none, so an unverified OIDC email is dropped here. Checks the linked
                // identities too: a guest who saved with Twitch can still carry
                // sign_in_provider "anonymous".
                const identityProviders = hasLinkedIdentity ? Object.keys(identities) : [];
                const usesOidc = [signInProvider, ...identityProviders].some((provider) => typeof provider === "string" && provider.startsWith("oidc."));
                if (usesOidc && !verified.emailVerified)
                    delete verified.email;
            }
            return verified;
        }
        catch (error) {
            return reject(rejectReasonFor(error));
        }
    };
};

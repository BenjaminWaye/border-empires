// Lets the admin pages be opened with a Google sign-in instead of a shared
// token: a Firebase ID token passed as `Authorization: Bearer <token>` is
// accepted for the read-only /admin/* endpoints when it verifies (signature,
// issuer, audience, expiry -- see firebase-token-verifier.ts) AND its email is
// verified AND matches ADMIN_EMAIL.
//
// email_verified is load-bearing: Firebase lets anyone create an
// email/password account with an address they don't own, so an unverified
// email equal to ADMIN_EMAIL must never grant access.
import type { FirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";

export type AdminFirebaseAuthConfig = {
  verifyIdToken: FirebaseTokenVerifier;
  adminEmail: string;
  // Counter hook for every Bearer token that didn't qualify.
  onReject?: () => void;
};

export const createAdminIdTokenCheck = (config: AdminFirebaseAuthConfig): ((token: string) => Promise<boolean>) => {
  const adminEmail = config.adminEmail.trim().toLowerCase();
  return async (token) => {
    const verified = adminEmail ? await config.verifyIdToken(token) : undefined;
    const isAdmin = Boolean(verified?.emailVerified && verified.email?.trim().toLowerCase() === adminEmail);
    if (!isAdmin) config.onReject?.();
    return isAdmin;
  };
};

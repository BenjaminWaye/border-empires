import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Ws } from "./server-runtime-config.js";

const now = (): number => Date.now();

export interface AuthIdentity {
  uid: string;
  playerId: string;
  name: string;
  email?: string | undefined;
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "border-empires";
const FIREBASE_TOKEN_CACHE_TTL_MS = 55 * 60 * 1000;
const FIREBASE_JWKS_TIMEOUT_MS = Math.max(1_500, Number(process.env.FIREBASE_JWKS_TIMEOUT_MS ?? 4_000));
const FIREBASE_JWKS_COOLDOWN_MS = Math.max(5_000, Number(process.env.FIREBASE_JWKS_COOLDOWN_MS ?? 15_000));
export const AUTH_VERIFY_TIMEOUT_MS = Math.max(750, Number(process.env.AUTH_VERIFY_TIMEOUT_MS ?? 1_500));
export const AUTH_PRIORITY_WINDOW_MS = Math.max(2_000, Number(process.env.AUTH_PRIORITY_WINDOW_MS ?? 10_000));

const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
  {
    timeoutDuration: FIREBASE_JWKS_TIMEOUT_MS,
    cooldownDuration: FIREBASE_JWKS_COOLDOWN_MS,
    cacheMaxAge: 12 * 60 * 60 * 1000
  }
);

type CachedFirebaseIdentity = { uid: string; email?: string | undefined; name?: string | undefined };
const verifiedFirebaseTokenCache = new Map<string, { decoded: CachedFirebaseIdentity; expiresAt: number }>();
const verifiedFirebaseIdentityByUid = new Map<string, { decoded: CachedFirebaseIdentity; expiresAt: number }>();

const firebaseAdminEnabled = Boolean(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY)
);

const firebaseAdminApp = firebaseAdminEnabled
  ? getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID
    })
  : undefined;

const firebaseAdminAuth = firebaseAdminApp ? getAuth(firebaseAdminApp) : undefined;

export const authPressureState = {
  pendingAuthVerifications: 0,
  authPriorityUntil: 0
};
export const authSyncTimingByPlayer = new Map<string, { authVerifiedAt?: number; initSentAt?: number; firstSubscribeAt?: number; firstChunkSentAt?: number }>();

export const sendLoginPhase = (
  socket: Ws | undefined,
  phase: "AUTH_RECEIVED" | "AUTH_VERIFIED" | "PLAYER_LOADED" | "INITIAL_SYNC" | "MAP_SUBSCRIBE" | "MAP_FIRST_CHUNK",
  title: string,
  detail: string
): void => {
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify({ type: "LOGIN_PHASE", phase, title, detail }));
};

export const classifyAuthError = (err: unknown): { code: "AUTH_FAIL" | "AUTH_UNAVAILABLE"; message: string } => {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (
    text.includes("AuthVerifyTimeout") ||
    text.includes("JWKSTimeout") ||
    text.includes("ERR_JWKS_TIMEOUT") ||
    text.includes("fetch failed") ||
    text.includes("ECONNREFUSED") ||
    text.includes("ECONNRESET") ||
    text.includes("ENOTFOUND") ||
    text.includes("ETIMEDOUT") ||
    text.includes("timed out") ||
    text.includes("network")
  ) {
    return { code: "AUTH_UNAVAILABLE", message: "Authentication service temporarily unavailable." };
  }
  return { code: "AUTH_FAIL", message: "Firebase token verification failed." };
};

export const cachedFirebaseIdentityForToken = (token: string): CachedFirebaseIdentity | undefined => {
  const cached = verifiedFirebaseTokenCache.get(token);
  if (!cached) return undefined;
  if (cached.expiresAt <= now()) {
    verifiedFirebaseTokenCache.delete(token);
    return undefined;
  }
  return cached.decoded;
};

export const verifiedFirebaseTokenCacheSize = (): number => verifiedFirebaseTokenCache.size;

const cachedFirebaseIdentityForUid = (uid: string): CachedFirebaseIdentity | undefined => {
  const cached = verifiedFirebaseIdentityByUid.get(uid);
  if (!cached) return undefined;
  if (cached.expiresAt <= now()) {
    verifiedFirebaseIdentityByUid.delete(uid);
    return undefined;
  }
  return cached.decoded;
};

export const decodeJwtPayload = (token: string): Record<string, unknown> | undefined => {
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const decodeFirebaseTokenFallback = (
  token: string
): { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } | undefined => {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;
  const issuer = typeof payload.iss === "string" ? payload.iss : "";
  const audience = typeof payload.aud === "string" ? payload.aud : "";
  const uid = typeof payload.user_id === "string" ? payload.user_id : typeof payload.sub === "string" ? payload.sub : "";
  const exp = typeof payload.exp === "number" ? payload.exp : undefined;
  const iat = typeof payload.iat === "number" ? payload.iat : undefined;
  if (issuer !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return undefined;
  if (audience !== FIREBASE_PROJECT_ID) return undefined;
  if (!uid) return undefined;
  const nowSec = Math.floor(now() / 1000);
  if (typeof exp === "number" && exp <= nowSec) return undefined;
  if (typeof iat === "number" && iat > nowSec + 60) return undefined;
  const decoded: { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } = { uid };
  if (typeof payload.email === "string") decoded.email = payload.email;
  if (typeof payload.name === "string") decoded.name = payload.name;
  if (typeof exp === "number") decoded.exp = exp;
  return decoded;
};

export const cachedFirebaseIdentityForDecodedToken = (token: string): CachedFirebaseIdentity | undefined => {
  const exact = cachedFirebaseIdentityForToken(token);
  if (exact) return exact;
  const decoded = decodeFirebaseTokenFallback(token);
  if (!decoded?.uid) return undefined;
  const cachedByUid = cachedFirebaseIdentityForUid(decoded.uid);
  if (!cachedByUid) return undefined;
  return {
    uid: cachedByUid.uid,
    email: decoded.email ?? cachedByUid.email,
    name: decoded.name ?? cachedByUid.name
  };
};

export const cacheVerifiedFirebaseIdentity = (
  token: string,
  decoded: CachedFirebaseIdentity,
  exp?: number
): void => {
  const expiresAt =
    typeof exp === "number" && Number.isFinite(exp)
      ? Math.max(now() + 60_000, exp * 1000)
      : now() + FIREBASE_TOKEN_CACHE_TTL_MS;
  verifiedFirebaseTokenCache.set(token, { decoded, expiresAt });
  verifiedFirebaseIdentityByUid.set(decoded.uid, { decoded, expiresAt });
};

export const verifyFirebaseToken = async (
  token: string
): Promise<{ uid: string; email?: string | undefined; name?: string | undefined; exp?: number }> => {
  authPressureState.pendingAuthVerifications += 1;
  authPressureState.authPriorityUntil = Math.max(authPressureState.authPriorityUntil, now() + AUTH_PRIORITY_WINDOW_MS);
  try {
    const verifyPromise = (async (): Promise<{
      uid: string;
      email?: string | undefined;
      name?: string | undefined;
      exp?: number;
    }> => {
      if (firebaseAdminAuth) {
        try {
          const verified = await firebaseAdminAuth.verifyIdToken(token, true);
          const decoded: { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } = {
            uid: String(verified.uid ?? "")
          };
          if (typeof verified.email === "string") decoded.email = verified.email;
          if (typeof verified.name === "string") decoded.name = verified.name;
          if (typeof verified.exp === "number") decoded.exp = verified.exp;
          return decoded;
        } catch (err) {
          const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          const adminCredentialUnavailable =
            text.includes("Could not load the default credentials") ||
            text.includes("app/invalid-credential") ||
            text.includes("MetadataLookupWarning");
          if (!adminCredentialUnavailable) throw err;
        }
      }

      const verified = await jwtVerify(token, firebaseJwks, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID
      });
      const decoded: { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } = {
        uid: String(verified.payload.user_id ?? verified.payload.sub ?? "")
      };
      if (typeof verified.payload.email === "string") decoded.email = verified.payload.email;
      if (typeof verified.payload.name === "string") decoded.name = verified.payload.name;
      if (typeof verified.payload.exp === "number") decoded.exp = verified.payload.exp;
      return decoded;
    })();

    return await Promise.race([
      verifyPromise,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`AuthVerifyTimeout after ${AUTH_VERIFY_TIMEOUT_MS}ms`)), AUTH_VERIFY_TIMEOUT_MS);
        timer.unref?.();
      })
    ]);
  } finally {
    authPressureState.pendingAuthVerifications = Math.max(0, authPressureState.pendingAuthVerifications - 1);
  }
};

import { describe, expect, it } from "vitest";

import type { FirebaseTokenVerifier, VerifiedFirebaseToken } from "../auth-identity/firebase-token-verifier.js";
import { createAdminAuthorizer } from "./admin-auth.js";
import { createAdminIdTokenCheck } from "./admin-firebase-auth.js";

// Stub verifier: each "token" string maps to the claims a real verification
// would return; anything else fails verification (forged/expired/etc.).
const verifierFor = (tokens: Record<string, VerifiedFirebaseToken>): FirebaseTokenVerifier => async (token) => tokens[token];

const verifyIdToken = verifierFor({
  "admin-verified": { uid: "u1", email: "Admin@Example.com", emailVerified: true },
  "admin-unverified": { uid: "u2", email: "admin@example.com" },
  "someone-else": { uid: "u3", email: "player@example.com", emailVerified: true },
  "no-email": { uid: "u4" }
});

describe("createAdminIdTokenCheck", () => {
  const check = createAdminIdTokenCheck({ verifyIdToken, adminEmail: " admin@example.com " });

  it("accepts a verified token for the admin's verified email, case-insensitively", async () => {
    await expect(check("admin-verified")).resolves.toBe(true);
  });

  it("rejects the admin's address when Firebase hasn't verified it (e.g. a squatted email/password account)", async () => {
    await expect(check("admin-unverified")).resolves.toBe(false);
  });

  it("rejects other users, email-less tokens, and tokens that fail verification", async () => {
    await expect(check("someone-else")).resolves.toBe(false);
    await expect(check("no-email")).resolves.toBe(false);
    await expect(check("forged")).resolves.toBe(false);
  });

  it("counts every token that doesn't qualify, and only those", async () => {
    let rejected = 0;
    const counted = createAdminIdTokenCheck({ verifyIdToken, adminEmail: "admin@example.com", onReject: () => { rejected += 1; } });
    await counted("admin-verified");
    await counted("admin-unverified");
    await counted("forged");
    expect(rejected).toBe(2);
  });

  it("never matches when ADMIN_EMAIL is blank", async () => {
    await expect(createAdminIdTokenCheck({ verifyIdToken, adminEmail: "  " })("admin-verified")).resolves.toBe(false);
  });
});

describe("createAdminAuthorizer with Google sign-in", () => {
  const authorizer = createAdminAuthorizer({
    adminApiToken: "static-secret",
    isAdminIdToken: createAdminIdTokenCheck({ verifyIdToken, adminEmail: "admin@example.com" })
  });

  it("allows read-only admin endpoints with the admin's ID token as a Bearer header", async () => {
    await expect(authorizer.adminRequestAuthorized({ headers: { authorization: "Bearer admin-verified" } })).resolves.toBe(true);
    await expect(authorizer.adminRequestAuthorized({ headers: { authorization: "Bearer someone-else" } })).resolves.toBe(false);
  });

  it("does not accept an ID token via ?token= (only the static token works there)", async () => {
    await expect(authorizer.adminRequestAuthorized({ headers: {}, query: { token: "admin-verified" } })).resolves.toBe(false);
  });

  it("keeps destructive endpoints static-token only", () => {
    expect(authorizer.adminAuthorized("Bearer admin-verified")).toBe(false);
    expect(authorizer.adminAuthorized("Bearer static-secret")).toBe(true);
  });
});

describe("createAdminIdTokenCheck with maxAuthAgeMs (agent-token minting)", () => {
  const NOW = 1_800_000_000_000;
  const fresh = createAdminIdTokenCheck(
    {
      verifyIdToken: verifierFor({
        recent: { uid: "u1", email: "admin@example.com", emailVerified: true, authTime: NOW / 1000 - 60 },
        old: { uid: "u1", email: "admin@example.com", emailVerified: true, authTime: NOW / 1000 - 3600 },
        "no-auth-time": { uid: "u1", email: "admin@example.com", emailVerified: true }
      }),
      adminEmail: "admin@example.com"
    },
    { maxAuthAgeMs: 10 * 60 * 1000, now: () => NOW }
  );

  it("accepts a sign-in made within the window", async () => {
    await expect(fresh("recent")).resolves.toBe(true);
  });

  it("rejects an hour-old sign-in and a token without auth_time, even for the admin", async () => {
    await expect(fresh("old")).resolves.toBe(false);
    await expect(fresh("no-auth-time")).resolves.toBe(false);
  });
});

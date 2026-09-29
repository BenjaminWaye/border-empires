import { describe, expect, it } from "vitest";

import { resolveGatewayAuthIdentity } from "./auth-identity.js";
import type { VerifiedFirebaseToken } from "./firebase-token-verifier.js";

// Guest detection itself (sign_in_provider "anonymous") is covered in
// firebase-token-verifier.test.ts; this checks the resolved identity carries it.
const JWT_SHAPED = "header.payload.signature";
const verifierReturning = (verified: VerifiedFirebaseToken) => async () => verified;

describe("resolveGatewayAuthIdentity guest detection", () => {
  it("marks a verified Firebase anonymous account as a guest, keyed on its uid", async () => {
    expect(await resolveGatewayAuthIdentity(JWT_SHAPED, { verifyFirebaseToken: verifierReturning({ uid: "anon-1", isGuest: true }) })).toEqual({
      playerId: "anon-1",
      playerName: "Player",
      authUid: "anon-1",
      isGuest: true
    });
  });

  it("does not mark verified real sign-ins as guests", async () => {
    const google = await resolveGatewayAuthIdentity(JWT_SHAPED, {
      verifyFirebaseToken: verifierReturning({ uid: "u-1", email: "a@example.com" })
    });
    expect(google?.isGuest).toBeUndefined();
  });
});

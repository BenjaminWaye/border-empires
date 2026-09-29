import { describe, expect, it } from "vitest";

import type { FirebaseTokenVerifier } from "./firebase-token-verifier.js";
import { resolveGatewayAuthIdentity } from "./auth-identity.js";

const unsignedJwt = (payload: Record<string, unknown>): string => {
  const enc = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.sig`;
};

// The guest computation itself (anonymous provider, no email, no linked
// identity) is tested against real signed tokens in
// firebase-token-verifier.test.ts. This only checks that isGuest, once the
// verifier has decided it, survives resolveGatewayAuthIdentity's pass-through
// unchanged.
const verifiedAs = (claims: { uid: string; email?: string; name?: string; isGuest?: boolean }): FirebaseTokenVerifier => async () => claims;

describe("resolveGatewayAuthIdentity guest pass-through", () => {
  it("carries isGuest through from the verified token", async () => {
    const identity = await resolveGatewayAuthIdentity(unsignedJwt({}), { verifyFirebaseToken: verifiedAs({ uid: "anon-1", isGuest: true }) });

    expect(identity).toEqual({ playerId: "anon-1", playerName: "Player", authUid: "anon-1", isGuest: true });
  });

  it("omits isGuest for a real account, matching the verifier's own omission when not a guest", async () => {
    const identity = await resolveGatewayAuthIdentity(unsignedJwt({}), {
      verifyFirebaseToken: verifiedAs({ uid: "u-1", email: "a@example.com" })
    });

    expect(identity?.isGuest).toBeUndefined();
    expect("isGuest" in (identity ?? {})).toBe(false);
  });
});

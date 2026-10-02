import { describe, expect, it } from "vitest";

import type { FirebaseTokenVerifier } from "./firebase-token-verifier.js";
import { initialSocialNameForSeedPlayer, resolveGatewayAuthIdentity, socialRegistrationNameFor } from "./auth-identity.js";

const unsignedJwt = (payload: Record<string, unknown>): string => {
  const enc = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.sig`;
};

const verifiedAs =
  (claims: { uid: string; email?: string; name?: string }): FirebaseTokenVerifier =>
  async () =>
    claims;
const rejectsEverything: FirebaseTokenVerifier = async () => undefined;

describe("resolveGatewayAuthIdentity", () => {
  it("keeps plain non-jwt tokens as direct player ids only when explicitly allowed", async () => {
    expect(await resolveGatewayAuthIdentity("player-1", { allowDirectPlayerIdToken: true })).toEqual({
      playerId: "player-1",
      playerName: "player-1"
    });
  });

  it("rejects unmapped non-jwt tokens when direct player ids are disabled", async () => {
    expect(await resolveGatewayAuthIdentity("staging-probe-1777570947079-1")).toBeUndefined();
  });

  it("maps verified firebase identities onto the configured local human player id", async () => {
    const identity = await resolveGatewayAuthIdentity(unsignedJwt({}), {
      defaultHumanPlayerId: "player-1",
      verifyFirebaseToken: verifiedAs({ uid: "firebase-user-1", email: "nauticus@example.com", name: "Nauticus" })
    });
    expect(identity).toEqual({
      playerId: "player-1",
      playerName: "Nauticus",
      authUid: "firebase-user-1",
      authEmail: "nauticus@example.com"
    });
  });

  it("uses the verified firebase uid as the player id by default", async () => {
    const identity = await resolveGatewayAuthIdentity(unsignedJwt({}), {
      verifyFirebaseToken: verifiedAs({ uid: "firebase-user-1", email: "nauticus@example.com" })
    });
    expect(identity).toEqual(expect.objectContaining({ playerId: "firebase-user-1", playerName: "nauticus" }));
  });

  it("accepts anonymous firebase identities that have no email or name", async () => {
    const identity = await resolveGatewayAuthIdentity(unsignedJwt({}), {
      verifyFirebaseToken: verifiedAs({ uid: "anon-1" })
    });
    expect(identity).toEqual({ playerId: "anon-1", playerName: "Player", authUid: "anon-1" });
  });

  // Regression: a forged token with a victim's uid used to be decoded without any
  // signature check and logged in as the victim.
  it("rejects a forged jwt-shaped token whose claims name a victim uid", async () => {
    const forged = unsignedJwt({ sub: "victim-uid", user_id: "victim-uid", email: "victim@example.com" });
    expect(await resolveGatewayAuthIdentity(forged, { verifyFirebaseToken: rejectsEverything })).toBeUndefined();
    // No verifier wired at all also fails closed rather than falling back to decoding.
    expect(await resolveGatewayAuthIdentity(forged, {})).toBeUndefined();
  });

  it("does not turn a rejected jwt into a direct player id, even when direct ids are allowed", async () => {
    const forged = unsignedJwt({ sub: "victim-uid" });
    expect(
      await resolveGatewayAuthIdentity(forged, {
        allowDirectPlayerIdToken: true,
        defaultHumanPlayerId: "player-1",
        verifyFirebaseToken: rejectsEverything
      })
    ).toBeUndefined();
  });

  it("maps direct snapshot auth uids only where direct player-id tokens are allowed (dev/test)", async () => {
    const authIdentities = [
      { uid: "firebase-user-1", playerId: "snapshot-player-1", name: "Nauticus", email: "nauticus@example.com" }
    ];
    expect(await resolveGatewayAuthIdentity("firebase-user-1", { allowDirectPlayerIdToken: true, authIdentities })).toEqual({
      playerId: "snapshot-player-1",
      playerName: "Nauticus",
      authUid: "firebase-user-1",
      authEmail: "nauticus@example.com"
    });
    // Uids are visible to every client, so outside dev a bare uid must not log in.
    expect(await resolveGatewayAuthIdentity("firebase-user-1", { authIdentities })).toBeUndefined();
  });

  it("maps a verified token onto a snapshot auth identity by uid", async () => {
    const identity = await resolveGatewayAuthIdentity(unsignedJwt({}), {
      authIdentities: [{ uid: "firebase-user-1", playerId: "snapshot-player-1", name: "Nauticus" }],
      verifyFirebaseToken: verifiedAs({ uid: "firebase-user-1" })
    });
    expect(identity).toEqual(expect.objectContaining({ playerId: "snapshot-player-1", playerName: "Nauticus" }));
  });

  it("anonymizes opaque auth tokens instead of leaking the raw id", async () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789";
    expect(await resolveGatewayAuthIdentity(token, { allowDirectPlayerIdToken: true })).toEqual(
      expect.objectContaining({
        playerId: token,
        playerName: expect.stringMatching(/^Empire [0-9A-Z]{6}$/)
      })
    );
  });
});

describe("initialSocialNameForSeedPlayer", () => {
  it("uses the cosmetic 'Nauticus' default for an uncustomized player-1, matching the leaderboard fallback", () => {
    expect(initialSocialNameForSeedPlayer("player-1", undefined)).toBe("Nauticus");
    expect(initialSocialNameForSeedPlayer("player-1", "player-1")).toBe("Nauticus");
  });

  it("keeps a real customized name for player-1 once one has been set", () => {
    expect(initialSocialNameForSeedPlayer("player-1", "Valen")).toBe("Valen");
  });

  it("still labels AI and barbarian seed players as before", () => {
    expect(initialSocialNameForSeedPlayer("ai-6", undefined)).toBe("AI 6");
    expect(initialSocialNameForSeedPlayer("barbarian-1", undefined)).toBe("Barbarians");
  });
});

describe("socialRegistrationNameFor", () => {
  it("applies the cosmetic default when the resolved auth name is just the raw player id (never customized)", () => {
    // This is the direct-player-id-token auth path (resolveGatewayAuthIdentity
    // returns { playerId: "player-1", playerName: "player-1" }): without this
    // mapping, social-state would register the player under the literal id
    // "player-1", while the leaderboard/alliance-search dropdown shows them
    // as "Nauticus" to other players — making "Nauticus" unresolvable by
    // resolveByName and alliance/truce requests fail with "target not found".
    expect(socialRegistrationNameFor("player-1", "player-1")).toBe("Nauticus");
  });

  it("keeps a real resolved auth/profile name unchanged", () => {
    expect(socialRegistrationNameFor("player-1", "Valen")).toBe("Valen");
    expect(socialRegistrationNameFor("player-2", "player-2")).toBe("player-2");
  });
});

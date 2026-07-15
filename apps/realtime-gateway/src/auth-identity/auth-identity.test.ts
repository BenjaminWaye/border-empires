import { describe, expect, it } from "vitest";

import { initialSocialNameForSeedPlayer, resolveGatewayAuthIdentity, socialRegistrationNameFor } from "./auth-identity.js";

describe("resolveGatewayAuthIdentity", () => {
  it("keeps plain non-jwt tokens as direct player ids only when explicitly allowed", () => {
    expect(resolveGatewayAuthIdentity("player-1", { allowDirectPlayerIdToken: true })).toEqual({
      playerId: "player-1",
      playerName: "player-1"
    });
  });

  it("rejects unmapped non-jwt tokens when direct player ids are disabled", () => {
    expect(resolveGatewayAuthIdentity("staging-probe-1777570947079-1")).toBeUndefined();
  });

  it("maps decoded firebase jwt identities onto the configured local human player id", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "firebase-user-1",
        user_id: "firebase-user-1",
        email: "nauticus@example.com",
        name: "Nauticus"
      })
    ).toString("base64url");
    const token = `${header}.${payload}.sig`;

    expect(resolveGatewayAuthIdentity(token, { defaultHumanPlayerId: "player-1" })).toEqual({
      playerId: "player-1",
      playerName: "Nauticus",
      authUid: "firebase-user-1",
      authEmail: "nauticus@example.com"
    });
  });

  it("maps direct snapshot auth uids without requiring a decoded jwt", () => {
    expect(
      resolveGatewayAuthIdentity("firebase-user-1", {
        authIdentities: [
          {
            uid: "firebase-user-1",
            playerId: "snapshot-player-1",
            name: "Nauticus",
            email: "nauticus@example.com"
          }
        ]
      })
    ).toEqual({
      playerId: "snapshot-player-1",
      playerName: "Nauticus",
      authUid: "firebase-user-1",
      authEmail: "nauticus@example.com"
    });
  });

  it("anonymizes opaque auth tokens instead of leaking the raw id", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789";
    expect(resolveGatewayAuthIdentity(token, { allowDirectPlayerIdToken: true })).toEqual(
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

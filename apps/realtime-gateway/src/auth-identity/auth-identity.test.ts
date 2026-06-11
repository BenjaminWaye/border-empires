import { describe, expect, it } from "vitest";

import { resolveGatewayAuthIdentity } from "./auth-identity.js";

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

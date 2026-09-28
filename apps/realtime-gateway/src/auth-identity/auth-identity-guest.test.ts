import { describe, expect, it } from "vitest";

import { resolveGatewayAuthIdentity } from "./auth-identity.js";

const token = (claims: Record<string, unknown>): string =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

describe("resolveGatewayAuthIdentity guest detection", () => {
  it("marks a Firebase anonymous account as a guest, keyed on its uid", () => {
    expect(resolveGatewayAuthIdentity(token({ user_id: "anon-1", firebase: { sign_in_provider: "anonymous" } }))).toEqual({
      playerId: "anon-1",
      playerName: "Player",
      authUid: "anon-1",
      isGuest: true
    });
  });

  it("treats an anonymous account that has been linked to a real sign-in as a real account, whatever sign_in_provider still says", () => {
    const linkedByEmailClaim = resolveGatewayAuthIdentity(
      token({ user_id: "u-a", email: "a@example.com", firebase: { sign_in_provider: "anonymous", identities: {} } })
    );
    const linkedByIdentities = resolveGatewayAuthIdentity(
      token({ user_id: "u-b", firebase: { sign_in_provider: "anonymous", identities: { "google.com": ["123"] } } })
    );
    const stillGuest = resolveGatewayAuthIdentity(token({ user_id: "u-c", firebase: { sign_in_provider: "anonymous", identities: {} } }));

    expect(linkedByEmailClaim?.isGuest).toBeUndefined();
    expect(linkedByIdentities?.isGuest).toBeUndefined();
    expect(stillGuest?.isGuest).toBe(true);
  });

  it("does not mark real sign-ins, or tokens without provider info, as guests", () => {
    const google = resolveGatewayAuthIdentity(
      token({ user_id: "u-1", email: "a@example.com", firebase: { sign_in_provider: "google.com" } })
    );
    expect(google?.isGuest).toBeUndefined();
    expect(resolveGatewayAuthIdentity(token({ user_id: "u-2" }))?.isGuest).toBeUndefined();
    expect(resolveGatewayAuthIdentity(token({ user_id: "u-3", firebase: "anonymous" }))?.isGuest).toBeUndefined();
  });
});

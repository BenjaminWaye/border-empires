import { describe, expect, it } from "vitest";
import { createTwitchProvider } from "./client-app-runtime-env.js";

describe("createTwitchProvider", () => {
  it("targets the oidc.twitch provider and asks Twitch for the email claim", () => {
    const provider = createTwitchProvider();
    expect(provider.providerId).toBe("oidc.twitch");
    expect(provider.getScopes()).toEqual(expect.arrayContaining(["openid", "user:read:email"]));
    const claims = JSON.parse(String(provider.getCustomParameters().claims)) as { id_token: Record<string, null> };
    expect(Object.keys(claims.id_token)).toEqual(expect.arrayContaining(["email", "email_verified"]));
  });
});

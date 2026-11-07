import { describe, expect, it } from "vitest";

import { createAdminAgentTokens } from "./admin-agent-token.js";
import { createAdminAuthorizer } from "./admin-auth.js";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

describe("createAdminAgentTokens", () => {
  it("mints a token that verifies until it expires", () => {
    const tokens = createAdminAgentTokens("secret");
    const minted = tokens.mint(24, NOW)!;
    expect(minted.expiresAt).toBe(NOW + 24 * HOUR);
    expect(tokens.verify(minted.token, NOW + 23 * HOUR)).toBe(true);
    expect(tokens.verify(minted.token, NOW + 24 * HOUR)).toBe(false);
  });

  it("rejects a token signed under a different ADMIN_API_TOKEN (rotation revokes, envs don't cross)", () => {
    const minted = createAdminAgentTokens("old-secret").mint(24, NOW)!;
    expect(createAdminAgentTokens("new-secret").verify(minted.token, NOW)).toBe(false);
  });

  it("rejects a tampered expiry", () => {
    const tokens = createAdminAgentTokens("secret");
    const [prefix, , nonce, sig] = tokens.mint(1, NOW)!.token.split(".");
    expect(tokens.verify(`${prefix}.${NOW + 2 * HOUR}.${nonce}.${sig}`, NOW)).toBe(false);
  });

  it("accepts only the canonical signature spelling (base64url decoding is lenient)", () => {
    const tokens = createAdminAgentTokens("secret");
    const { token } = tokens.mint(1, NOW)!;
    expect(tokens.verify(token, NOW)).toBe(true);
    expect(tokens.verify(`${token}!!`, NOW)).toBe(false);
    expect(tokens.verify(`${token}=`, NOW)).toBe(false);
  });

  it("refuses unlisted lifetimes and refuses everything without ADMIN_API_TOKEN", () => {
    expect(createAdminAgentTokens("secret").mint(5, NOW)).toBeUndefined();
    const disabled = createAdminAgentTokens(undefined);
    expect(disabled.enabled).toBe(false);
    expect(disabled.mint(24, NOW)).toBeUndefined();
    expect(disabled.verify("bea1.1.a.b", NOW)).toBe(false);
  });
});

describe("agent tokens in createAdminAuthorizer", () => {
  const tokens = createAdminAgentTokens("secret");
  const token = tokens.mint(24)!.token;
  const authorizer = createAdminAuthorizer({
    adminApiToken: "secret",
    isAgentToken: (candidate) => tokens.verify(candidate),
    isAdminIdToken: async (candidate) => candidate === "google-id-token" || candidate === "stale-google-id-token",
    isFreshAdminIdToken: async (candidate) => candidate === "google-id-token"
  });
  const withBearer = (value: string) => ({ headers: { authorization: `Bearer ${value}` } });

  it("opens the read-only endpoints, but not through the ?token= query", async () => {
    await expect(authorizer.adminRequestAuthorized(withBearer(token))).resolves.toBe(true);
    await expect(authorizer.adminRequestAuthorized({ headers: {}, query: { token } })).resolves.toBe(false);
  });

  it("never opens destructive endpoints", () => {
    expect(authorizer.adminAuthorized(`Bearer ${token}`)).toBe(false);
  });

  it("cannot mint further tokens, nor can a stale Google sign-in, while a fresh one and the static token can", async () => {
    await expect(authorizer.adminMintAuthorized(withBearer(token))).resolves.toBe(false);
    await expect(authorizer.adminMintAuthorized(withBearer("stale-google-id-token"))).resolves.toBe(false);
    await expect(authorizer.adminMintAuthorized(withBearer("google-id-token"))).resolves.toBe(true);
    await expect(authorizer.adminMintAuthorized(withBearer("secret"))).resolves.toBe(true);
  });
});

import { SignJWT, generateKeyPair, type JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createFirebaseTokenVerifier, type FirebaseTokenRejectReason } from "./firebase-token-verifier.js";

const PROJECT = "border-empires";
const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

let trusted: Awaited<ReturnType<typeof generateKeyPair>>;
let attacker: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
  trusted = await generateKeyPair("RS256");
  attacker = await generateKeyPair("RS256");
});

const sign = (
  payload: JWTPayload,
  overrides: { key?: "trusted" | "attacker"; iss?: string; aud?: string; iat?: number; exp?: number; alg?: string } = {}
): Promise<string> =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: overrides.alg ?? "RS256", kid: "k1" })
    .setIssuer(overrides.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(overrides.aud ?? PROJECT)
    .setIssuedAt(overrides.iat ?? NOW_S - 60)
    .setExpirationTime(overrides.exp ?? NOW_S + 3600)
    .sign((overrides.key === "attacker" ? attacker : trusted).privateKey);

const unsigned = (payload: Record<string, unknown>): string => {
  const enc = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.`;
};

const makeVerifier = () => {
  const rejected: FirebaseTokenRejectReason[] = [];
  const verify = createFirebaseTokenVerifier({
    projectId: PROJECT,
    keySet: async () => trusted.publicKey,
    now: () => NOW_MS,
    onReject: (reason) => rejected.push(reason)
  });
  return { verify, rejected };
};

describe("createFirebaseTokenVerifier", () => {
  it("accepts a correctly signed token and returns its claims", async () => {
    const { verify, rejected } = makeVerifier();
    const token = await sign({ sub: "uid-1", user_id: "uid-1", email: "a@example.com", name: "Ada" });
    expect(await verify(token)).toEqual({ uid: "uid-1", email: "a@example.com", name: "Ada" });
    expect(rejected).toEqual([]);
  });

  it("reports emailVerified only when Firebase asserts email_verified: true", async () => {
    const { verify } = makeVerifier();
    expect(await verify(await sign({ sub: "u-v", email: "v@example.com", email_verified: true }))).toEqual({ uid: "u-v", email: "v@example.com", emailVerified: true });
    expect(await verify(await sign({ sub: "u-u", email: "u@example.com", email_verified: false }))).toEqual({ uid: "u-u", email: "u@example.com" });
    expect(await verify(await sign({ sub: "u-s", email: "s@example.com", email_verified: "true" }))).toEqual({ uid: "u-s", email: "s@example.com" });
  });

  it("accepts anonymous-provider tokens (no email, no name) and marks them as a guest", async () => {
    const { verify } = makeVerifier();
    const token = await sign({ sub: "anon-uid", firebase: { sign_in_provider: "anonymous", identities: {} } });
    expect(await verify(token)).toEqual({ uid: "anon-uid", isGuest: true });
  });

  it("does not mark a linked anonymous account (email or an identity present) as a guest", async () => {
    const { verify } = makeVerifier();
    const linkedByEmail = await sign({ sub: "u-a", email: "a@example.com", firebase: { sign_in_provider: "anonymous", identities: {} } });
    const linkedByIdentity = await sign({ sub: "u-b", firebase: { sign_in_provider: "anonymous", identities: { "google.com": ["123"] } } });

    expect(await verify(linkedByEmail)).toEqual({ uid: "u-a", email: "a@example.com" });
    expect(await verify(linkedByIdentity)).toEqual({ uid: "u-b" });
  });

  it("does not mark a real sign-in as a guest, and tolerates a token with no firebase claim at all", async () => {
    const { verify } = makeVerifier();
    const google = await sign({ sub: "u-c", email: "c@example.com", firebase: { sign_in_provider: "google.com", identities: {} } });
    const noFirebaseClaim = await sign({ sub: "u-d" });

    expect(await verify(google)).toEqual({ uid: "u-c", email: "c@example.com" });
    expect(await verify(noFirebaseClaim)).toEqual({ uid: "u-d" });
  });

  it("rejects an unsigned alg:none token carrying a victim uid", async () => {
    const { verify, rejected } = makeVerifier();
    const forged = unsigned({ sub: "victim", user_id: "victim", iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, exp: NOW_S + 3600, iat: NOW_S - 1 });
    expect(await verify(forged)).toBeUndefined();
    expect(rejected).toEqual(["bad_signature"]);
  });

  it("rejects a token signed with a key Google does not publish", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify(await sign({ sub: "victim" }, { key: "attacker" }))).toBeUndefined();
    expect(rejected).toEqual(["bad_signature"]);
  });

  it("rejects a token whose payload was swapped after signing", async () => {
    const { verify } = makeVerifier();
    const [h, , s] = (await sign({ sub: "attacker-uid" })).split(".");
    const swapped = Buffer.from(JSON.stringify({ sub: "victim", iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, exp: NOW_S + 3600, iat: NOW_S - 1 })).toString("base64url");
    expect(await verify(`${h}.${swapped}.${s}`)).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify(await sign({ sub: "u" }, { iat: NOW_S - 7200, exp: NOW_S - 3600 }))).toBeUndefined();
    expect(rejected).toEqual(["expired"]);
  });

  it("rejects a token issued in the future", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify(await sign({ sub: "u" }, { iat: NOW_S + 3600, exp: NOW_S + 7200 }))).toBeUndefined();
    expect(rejected).toEqual(["not_yet_valid"]);
  });

  it("rejects a wrong issuer", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify(await sign({ sub: "u" }, { iss: "https://securetoken.google.com/other-project" }))).toBeUndefined();
    expect(rejected).toEqual(["bad_issuer"]);
  });

  it("rejects a wrong audience (a token minted for a different Firebase project)", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify(await sign({ sub: "u" }, { aud: "other-project" }))).toBeUndefined();
    expect(rejected).toEqual(["bad_audience"]);
  });

  it("rejects a missing or empty subject", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify(await sign({}))).toBeUndefined();
    expect(await verify(await sign({ sub: "" }))).toBeUndefined();
    expect(rejected).toEqual(["missing_subject", "missing_subject"]);
  });

  it("rejects a non-RS256 algorithm even when otherwise valid", async () => {
    const { verify, rejected } = makeVerifier();
    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({ sub: "u" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setIssuedAt(NOW_S - 1)
      .setExpirationTime(NOW_S + 3600)
      .sign(privateKey);
    expect(await verify(token)).toBeUndefined();
    expect(rejected).toEqual(["bad_signature"]);
  });

  it("fails closed and never throws on garbage or when the key set is unreachable", async () => {
    const { verify, rejected } = makeVerifier();
    expect(await verify("not.a.jwt")).toBeUndefined();
    const down = createFirebaseTokenVerifier({
      projectId: PROJECT,
      keySet: async () => {
        throw new Error("network down");
      },
      now: () => NOW_MS,
      onReject: (reason) => rejected.push(reason)
    });
    expect(await down(await sign({ sub: "u" }))).toBeUndefined();
    expect(rejected).toEqual(["malformed", "key_fetch_failed"]);
  });
});

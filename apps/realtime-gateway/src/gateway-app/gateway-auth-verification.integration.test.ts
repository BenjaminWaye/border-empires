import { SignJWT, generateKeyPair, type JWTPayload } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createFirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, nextNonBootstrapMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

const PROJECT = "border-empires";
const ISSUER = `https://securetoken.google.com/${PROJECT}`;
// Each test boots a simulation + gateway; CI runners are slower than dev boxes.
const TEST_TIMEOUT_MS = 30_000;

// Regression for the forged-token login bypass: the gateway used to base64-decode
// the JWT payload and trust `user_id`/`sub` with no signature, issuer, audience or
// expiry check, so anyone who knew a player's uid (visible in tile ownerIds) could
// log in as them over the WebSocket or authenticate HTTP routes as them.
describe("gateway firebase token verification", () => {
  const cleanup: Array<() => Promise<void>> = [];
  let trusted: Awaited<ReturnType<typeof generateKeyPair>>;
  let attacker: Awaited<ReturnType<typeof generateKeyPair>>;

  beforeAll(async () => {
    trusted = await generateKeyPair("RS256");
    attacker = await generateKeyPair("RS256");
  });

  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  const sign = (payload: JWTPayload, opts: { key?: "trusted" | "attacker"; expiresInSeconds?: number } = {}): Promise<string> =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(PROJECT)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 3600))
      .sign((opts.key === "attacker" ? attacker : trusted).privateKey);

  const unsignedToken = (payload: Record<string, unknown>): string => {
    const enc = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.sig`;
  };

  // No defaultHumanPlayerId: this is the managed (staging/prod) configuration,
  // where direct player-id tokens are disabled and only verified tokens log in.
  const startGateway = async () => {
    const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      firebaseTokenVerifier: createFirebaseTokenVerifier({
        projectId: PROJECT,
        keySet: async () => trusted.publicKey,
        onReject: () => undefined
      })
    });
    cleanup.push(() => gateway.close());
    const address = await gateway.start();
    return { address, httpUrl: `http://${address.host}:${address.port}` };
  };

  const authOverSocket = async (wsUrl: string, token: string): Promise<Record<string, unknown>> => {
    const socket = await openSocket(wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token }));
    return nextNonBootstrapMessage(socket, "auth reply");
  };

  it("rejects forged, wrongly signed and expired tokens with AUTH_FAIL on the WebSocket path", async () => {
    const { address } = await startGateway();
    const victim = { sub: "victim-uid", user_id: "victim-uid", email: "victim@example.com" };

    const forged = unsignedToken({ ...victim, iss: ISSUER, aud: PROJECT, exp: Math.floor(Date.now() / 1000) + 3600 });
    const wrongKey = await sign(victim, { key: "attacker" });
    const expired = await sign(victim, { expiresInSeconds: -3600 });

    for (const token of [forged, wrongKey, expired]) {
      expect(await authOverSocket(address.wsUrl, token)).toMatchObject({ type: "ERROR", code: "AUTH_FAIL" });
    }
  }, TEST_TIMEOUT_MS);

  it("rejects a plain uid used as a token (no direct player-id login outside dev)", async () => {
    const { address } = await startGateway();
    expect(await authOverSocket(address.wsUrl, "victim-uid")).toMatchObject({ type: "ERROR", code: "AUTH_FAIL" });
  }, TEST_TIMEOUT_MS);

  it("accepts a correctly signed token, including an anonymous-provider token with no email", async () => {
    const { address } = await startGateway();
    const named = await sign({ sub: "real-uid", user_id: "real-uid", email: "real@example.com", name: "Real" });
    expect((await authOverSocket(address.wsUrl, named)).type).toBe("INIT");
    const anonymous = await sign({ sub: "anon-uid", firebase: { sign_in_provider: "anonymous", identities: {} } });
    expect((await authOverSocket(address.wsUrl, anonymous)).type).toBe("INIT");
  }, TEST_TIMEOUT_MS);

  it("returns 401 on the HTTP bearer path for forged and wrongly signed tokens, and counts rejections", async () => {
    const { httpUrl } = await startGateway();
    const post = (token: string): Promise<Response> =>
      fetch(`${httpUrl}/rally/links`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: "{}"
      });

    const forged = unsignedToken({ sub: "victim-uid", user_id: "victim-uid" });
    expect((await post(forged)).status).toBe(401);
    expect((await post(await sign({ sub: "victim-uid" }, { key: "attacker" }))).status).toBe(401);
    // A genuine token gets past authentication (it may fail later, e.g. no active season).
    expect((await post(await sign({ sub: "real-uid" }))).status).not.toBe(401);

    const metrics = await (await fetch(`${httpUrl}/metrics`)).text();
    expect(metrics).toMatch(/^gateway_auth_verification_rejected_total 2$/m);
  }, TEST_TIMEOUT_MS);
});

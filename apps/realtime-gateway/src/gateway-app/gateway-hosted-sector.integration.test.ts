import { HOSTED_SECTOR_TICKET_ISSUER, hostedSectorTicketAudience } from "@border-empires/shared";
import { SignJWT, exportSPKI, generateKeyPair, type JWTPayload } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createFirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, nextNonBootstrapMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

const PROJECT = "border-empires";
const SECTOR_ID = "s-test";
const ADMIN_TOKEN = "test-admin-token";
const TEST_TIMEOUT_MS = 30_000;

// A hosted sector is private and paid for one contest
// (docs/hosted-sectors-plan.md): only ticket holders get in, and nothing can
// start a second contest on its server.
describe("gateway in hosted-sector mode", () => {
  const cleanup: Array<() => Promise<void>> = [];
  let firebase: Awaited<ReturnType<typeof generateKeyPair>>;
  let hosting: Awaited<ReturnType<typeof generateKeyPair>>;
  let ticketPublicKey: string;

  beforeAll(async () => {
    firebase = await generateKeyPair("RS256");
    hosting = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    ticketPublicKey = (await exportSPKI(hosting.publicKey)).replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  });

  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  const idToken = (payload: JWTPayload): Promise<string> =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(firebase.privateKey);

  const ticket = (uid: string, sectorId = SECTOR_ID): Promise<string> =>
    new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuer(HOSTED_SECTOR_TICKET_ISSUER)
      .setAudience(hostedSectorTicketAudience(sectorId))
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(hosting.privateKey);

  const startGateway = async (hosted: boolean) => {
    const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      adminApiToken: ADMIN_TOKEN,
      firebaseTokenVerifier: createFirebaseTokenVerifier({ projectId: PROJECT, keySet: async () => firebase.publicKey, onReject: () => undefined }),
      ...(hosted ? { hostedSector: { sectorId: SECTOR_ID, ticketPublicKey } } : {})
    });
    cleanup.push(() => gateway.close());
    const address = await gateway.start();
    return { address, httpUrl: `http://${address.host}:${address.port}` };
  };

  const authOverSocket = async (wsUrl: string, message: { token: string; sectorTicket?: string }): Promise<Record<string, unknown>> => {
    const socket = await openSocket(wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", ...message }));
    return nextNonBootstrapMessage(socket, "auth reply");
  };

  it("admits a member with a ticket and refuses everyone else", async () => {
    const { address } = await startGateway(true);
    const member = await idToken({ sub: "member-uid", user_id: "member-uid", email: "member@example.com" });
    const stranger = await idToken({ sub: "stranger-uid", user_id: "stranger-uid", email: "stranger@example.com" });

    // Its own code: refreshing the sign-in, the client's answer to AUTH_FAIL, cannot help here.
    const refused = { type: "ERROR", code: "SECTOR_TICKET_REJECTED" };
    expect(await authOverSocket(address.wsUrl, { token: stranger })).toMatchObject(refused);
    expect(await authOverSocket(address.wsUrl, { token: stranger, sectorTicket: await ticket("member-uid") })).toMatchObject(refused);
    expect(await authOverSocket(address.wsUrl, { token: member, sectorTicket: await ticket("member-uid", "s-other") })).toMatchObject(refused);
    expect(await authOverSocket(address.wsUrl, { token: "not-a-token", sectorTicket: await ticket("member-uid") })).toMatchObject({ type: "ERROR", code: "AUTH_FAIL" });
    expect((await authOverSocket(address.wsUrl, { token: member, sectorTicket: await ticket("member-uid") })).type).toBe("INIT");
  }, TEST_TIMEOUT_MS);

  it("keeps signed-in HTTP routes for accounts that have entered the sector, and reports their visits to the hosting service", async () => {
    const { address, httpUrl } = await startGateway(true);
    const member = await idToken({ sub: "member-uid", user_id: "member-uid", email: "member@example.com" });
    const stranger = await idToken({ sub: "stranger-uid", user_id: "stranger-uid", email: "stranger@example.com" });
    const waitlist = (token: string) => fetch(`${httpUrl}/sector/waitlist`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });

    const statusOf = async (token: string) => fetch(`${httpUrl}/admin/hosted/status`, { headers: { authorization: `Bearer ${token}` } });
    expect((await statusOf("wrong")).status).toBe(401);
    expect(await (await statusOf(ADMIN_TOKEN)).json()).toEqual({ ok: true });
    expect((await authOverSocket(address.wsUrl, { token: member, sectorTicket: await ticket("member-uid") })).type).toBe("INIT");
    // The hosting service closes a sector nobody visits; a member's entry counts as a visit.
    await expect.poll(async () => ((await (await statusOf(ADMIN_TOKEN)).json()) as { lastHumanVisitAt?: number }).lastHumanVisitAt).toBeGreaterThan(0);
    expect((await waitlist(stranger)).status).toBe(401);
    expect((await waitlist(member)).status).not.toBe(401);
  }, TEST_TIMEOUT_MS);

  it("leaves a public server open to accounts without a ticket", async () => {
    const { address } = await startGateway(false);
    const player = await idToken({ sub: "player-uid", user_id: "player-uid", email: "player@example.com" });
    expect((await authOverSocket(address.wsUrl, { token: player })).type).toBe("INIT");
  }, TEST_TIMEOUT_MS);

  it("refuses to start a second contest, even forced by an admin", async () => {
    const { httpUrl } = await startGateway(true);
    const response = await fetch(`${httpUrl}/admin/season/start-next?force=true`, { method: "POST", headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("single Sector Contest") });
    const summary = (await (await fetch(`${httpUrl}/hq/summary`)).json()) as { seasonSequence?: number };
    expect(summary.seasonSequence).toBe(1);
  }, TEST_TIMEOUT_MS);
});

import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseType } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedFirebaseToken } from "../auth-identity/firebase-token-verifier.js";
import { SqliteGatewayAuthBindingStore } from "../sqlite-auth-binding-store.js";
import { registerAccountDeletionRoutes } from "./account-deletion-routes.js";
import { allowAccountSession, createAuthResolvers } from "../gateway-app/create-auth-resolvers.js";
import { reconcileGatewayAuthBinding } from "../gateway-auth-binding-resolution/gateway-auth-binding-resolution.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseType };
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const setup = async (claims: VerifiedFirebaseToken | undefined = { uid: "owner", authTime: 1000 }) => {
  const db = new DatabaseSync(":memory:");
  const bindings = new SqliteGatewayAuthBindingStore(db, () => 1_000_000);
  await bindings.applySchema();
  await bindings.bindIdentity({ uid: "owner", playerId: "empire", email: "owner@example.invalid" });
  await bindings.bindIdentity({ uid: "other-login", playerId: "empire" });
  const app = Fastify();
  const deleteIdentity = vi.fn(async () => true);
  const verifyToken = vi.fn(async () => claims);
  const disconnectPlayer = vi.fn();
  registerAccountDeletionRoutes(app, { store: bindings.accountDeletion, bindings, verifyToken, deleteIdentity, disconnectPlayer, now: () => 1_000_000 });
  cleanup.push(async () => { await app.close(); db.close(); });
  return { app, db, bindings, deleteIdentity, verifyToken, disconnectPlayer };
};
const post = (app: ReturnType<typeof Fastify>, body: object = { confirmation: "DELETE" }) => app.inject({
  method: "POST", url: "/account/deletion", headers: { authorization: "Bearer signed-token" }, payload: body
});

describe("account deletion", () => {
  it("disconnects live sessions and rejects a login that bootstrapped while deletion was accepted", async () => {
    const { app, bindings, disconnectPlayer } = await setup();
    const socket = { close: vi.fn() };
    expect(await allowAccountSession("other-login", bindings, socket)).toBe(true);
    await post(app);
    expect(disconnectPlayer).toHaveBeenCalledWith("empire");
    expect(await allowAccountSession("other-login", bindings, socket)).toBe(false);
    expect(socket.close).toHaveBeenCalledWith(4003, "account_deleted");
  });
  it("blocks replay of deleted identities over both WebSocket and HTTP authentication", async () => {
    const { app, bindings } = await setup();
    const onReject = vi.fn();
    const resolvers = createAuthResolvers({
      options: { firebaseTokenVerifier: async () => ({ uid: "owner", email: "owner@example.invalid" }) },
      getAuthIdentities: () => undefined, bindings,
      reconcile: (identity) => reconcileGatewayAuthBinding(identity, bindings), onReject, onRejectReason: vi.fn()
    });
    expect(await resolvers.resolveHttpBearerIdentity("Bearer signed.token.value")).toMatchObject({ playerId: "empire" });
    await post(app);
    expect(await resolvers.resolveIdentityForToken("signed.token.value")).toBeUndefined();
    expect(await resolvers.resolveHttpBearerIdentity("Bearer signed.token.value")).toBeUndefined();
    expect(onReject).toHaveBeenCalledTimes(2);
    const newAccount = await reconcileGatewayAuthBinding({ authUid: "new-owner", authEmail: "owner@example.invalid", playerId: "new-owner", playerName: "Fresh" }, bindings);
    expect(newAccount.playerId).toBe("new-owner");
  });
  it("persists the mapped empire before deleting Firebase and returns a private receipt, never a token/identity", async () => {
    const { app, db, bindings, deleteIdentity } = await setup();
    deleteIdentity.mockImplementation(async () => {
      expect((await bindings.accountDeletion.get("owner"))?.status).toBe("awaiting_identity");
      return true;
    });
    const response = await post(app);
    expect(response.statusCode).toBe(202);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ ok: true, request: { status: "pending", requestedAt: 1_000_000, completeBy: 2_593_000_000 } });
    expect(response.body).not.toMatch(/signed-token|owner|empire|example/);
    const row = db.prepare("SELECT * FROM account_deletion_requests").get();
    expect(row).toMatchObject({ auth_uid: "owner", player_id: "empire", status: "pending" });
    expect(JSON.stringify(row)).not.toContain("signed-token");
    expect(await bindings.accountDeletion.isBlocked("owner")).toBe(true);
    expect(await bindings.accountDeletion.isBlocked("other-login")).toBe(true);
    expect(await bindings.getByEmail("owner@example.invalid")).toBeUndefined();
  });

  it("is idempotent when the response is lost after deleting Firebase", async () => {
    const { app, deleteIdentity } = await setup();
    const first = await post(app);
    const retry = await post(app);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(deleteIdentity).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, { uid: "owner" }, { uid: "owner", authTime: 0 }, { uid: "owner", authTime: 2000 }])("rejects invalid or stale claims %j", async (claims) => {
    const { app, deleteIdentity, verifyToken } = await setup();
    verifyToken.mockResolvedValue(claims);
    const response = await post(app);
    expect(response.statusCode).toBe(401);
    expect(deleteIdentity).not.toHaveBeenCalled();
  });

  it("requires literal confirmation and forbids a caller-supplied target identity", async () => {
    const { app, deleteIdentity } = await setup();
    expect((await post(app, { confirmation: "delete" })).statusCode).toBe(400);
    expect((await post(app, { confirmation: "DELETE", playerId: "victim" })).statusCode).toBe(400);
    expect(deleteIdentity).not.toHaveBeenCalled();
  });

  it("keeps durable work and permits a retry if Firebase's response is lost", async () => {
    const { app, deleteIdentity, bindings } = await setup();
    deleteIdentity.mockRejectedValueOnce(new Error("network error"));
    expect((await post(app)).statusCode).toBe(503);
    expect((await bindings.accountDeletion.get("owner"))?.status).toBe("awaiting_identity");
    expect(await bindings.accountDeletion.isBlocked("owner")).toBe(false);
    expect((await post(app)).statusCode).toBe(202);
    expect(await bindings.accountDeletion.isBlocked("owner")).toBe(true);
  });

  it("supports unsaved guests without requiring an unavailable password", async () => {
    const { app } = await setup({ uid: "guest", isGuest: true, authTime: 0 });
    expect((await post(app)).statusCode).toBe(202);
  });

  it("exposes bounded queue metrics, including overdue work", async () => {
    const { app, bindings, db } = await setup();
    await post(app);
    db.exec("UPDATE account_deletion_requests SET requested_at = -3000000000");
    expect(await bindings.accountDeletion.metrics()).toContain('gateway_account_deletion_requests{status="pending"} 1');
    expect(await bindings.accountDeletion.metrics()).toContain("gateway_account_deletion_overdue 1");
  });
});

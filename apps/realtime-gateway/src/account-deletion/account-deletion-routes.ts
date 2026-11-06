import type { FastifyInstance } from "fastify";
import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { createFirebaseTokenVerifier, type FirebaseTokenVerifier } from "../auth-identity/firebase-token-verifier.js";
import type { AccountDeletionRequest, AccountDeletionStore } from "./account-deletion-store.js";

interface DeletionRouteDeps {
  store: AccountDeletionStore;
  bindings: GatewayAuthBindingStore;
  verifyToken?: FirebaseTokenVerifier;
  deleteIdentity?: (token: string) => Promise<boolean>;
  disconnectPlayer?: (playerId: string) => void;
  now?: () => number;
}

// Firebase enforces ownership/recent login again using the account holder's
// ID token. No privileged credential is needed. Never persist or log the token.
export const deleteFirebaseIdentity = async (token: string): Promise<boolean> => {
  const key = process.env.GATEWAY_FIREBASE_API_KEY ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(10_000)
  });
  if (response.ok) return true;
  const result: unknown = await response.json();
  // A lost response may follow a successful deletion. Retry with the still-
  // signed original ID token; its signature is verified before reaching here.
  return typeof result === "object" && result !== null && "error" in result &&
    typeof result.error === "object" && result.error !== null && "message" in result.error &&
    result.error.message === "USER_NOT_FOUND";
};

export const registerAccountDeletionRoutes = (app: FastifyInstance, deps: DeletionRouteDeps): void => {
  const verify = deps.verifyToken ?? createFirebaseTokenVerifier({ projectId: process.env.GATEWAY_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID });
  const deleteIdentity = deps.deleteIdentity ?? deleteFirebaseIdentity;
  const now = deps.now ?? Date.now;
  app.post("/account/deletion", {
    bodyLimit: 1024,
    preValidation: async (request, reply) => {
      // Fastify's default Ajv removes additional properties. Reject supplied
      // identities explicitly instead of silently accepting a misleading body.
      if (request.body && typeof request.body === "object" && Object.keys(request.body).some((key) => key !== "confirmation")) {
        return reply.code(400).send({ ok: false, error: "unexpected_fields" });
      }
    },
    schema: { body: { type: "object", required: ["confirmation"], additionalProperties: false,
      properties: { confirmation: { type: "string", const: "DELETE" } } } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const identity = token ? await verify(token) : undefined;
    if (!identity) return reply.code(401).send({ ok: false, error: "sign_in_required" });
    const binding = await deps.bindings.getByUid(identity.uid);
    const playerId = binding?.playerId ?? identity.uid;
    const previous = await deps.store.get(identity.uid);
    if (previous && previous.status !== "awaiting_identity") {
      deps.disconnectPlayer?.(playerId);
      return { ok: true, request: previous };
    }
    if (!identity.isGuest && (identity.authTime === undefined || now() / 1000 - identity.authTime > 300 || identity.authTime > now() / 1000 + 30)) {
      return reply.code(401).send({ ok: false, error: "recent_sign_in_required" });
    }
    // An account may never have entered the game. Never accept a player/UID
    // supplied by the caller, even when no binding has been created yet.
    let queued: AccountDeletionRequest | undefined;
    try {
      queued = await deps.store.request(identity.uid, playerId);
      if (!(await deleteIdentity(token))) return reply.code(401).send({ ok: false, error: "recent_sign_in_required" });
      await deps.store.confirmIdentityDeleted(identity.uid);
      deps.disconnectPlayer?.(playerId);
    } catch {
      app.log.error({ requestId: queued?.requestId }, "account_deletion_identity_or_queue_failed");
      return reply.code(503).send({ ok: false, error: "deletion_retry_required" });
    }
    app.log.info({ requestId: queued.requestId, completeBy: queued.completeBy }, "account_deletion_pending");
    return reply.code(202).send({ ok: true, request: { ...queued, status: "pending" } });
  });
};

// How the hosting service (apps/sector-control) grants and takes back a
// cosmetic someone bought (plan section 15, step 8e). It knows the buyer by
// their Firebase uid; the gateway knows accounts by player id, so the uid is
// resolved here through the auth binding store.
//
// These routes accept only HOSTING_SERVICE_TOKEN (hosting-service-auth.ts),
// never ADMIN_API_TOKEN. Without it the routes do not exist.
import { cosmeticProduct } from "@border-empires/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { assertHostingServiceToken, hostingServiceAuthorized } from "../hosting-service-auth/hosting-service-auth.js";
import type { AccountCosmeticsService } from "./account-cosmetics-service.js";

export type AccountCosmeticsPurchaseRouteDeps = {
  grantToken: string;
  authBindingStore: Pick<GatewayAuthBindingStore, "getByUid">;
  cosmetics: Pick<AccountCosmeticsService, "grantProduct" | "revoke">;
};

export const registerAccountCosmeticsPurchaseRoutes = (app: FastifyInstance, deps: AccountCosmeticsPurchaseRouteDeps): void => {
  assertHostingServiceToken(deps.grantToken);

  /** The buyer's player id and the product, or undefined after the reply was sent. */
  const resolve = async (request: FastifyRequest, reply: FastifyReply): Promise<{ playerId: string; productId: string; grantRef: string } | undefined> => {
    if (!hostingServiceAuthorized(request.headers.authorization, deps.grantToken)) {
      void reply.code(401).send({ ok: false, error: "unauthorized" });
      return undefined;
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const { uid, productId, grantRef } = body;
    if (typeof uid !== "string" || !uid || typeof productId !== "string" || !cosmeticProduct(productId)) {
      void reply.code(400).send({ ok: false, error: "uid and a known productId are required" });
      return undefined;
    }
    const binding = await deps.authBindingStore.getByUid(uid);
    if (!binding) {
      // Bought before ever entering the game: the hosting service keeps trying until the account exists here.
      void reply.code(404).send({ ok: false, error: "no_player" });
      return undefined;
    }
    return { playerId: binding.playerId, productId, grantRef: typeof grantRef === "string" && grantRef ? grantRef.slice(0, 200) : "purchase" };
  };

  // Idempotent: granting what is owned already changes nothing and still answers ok.
  app.post("/admin/cosmetics/purchase-grant", async (request, reply) => {
    const target = await resolve(request, reply);
    if (!target) return reply;
    const outcome = await deps.cosmetics.grantProduct(target.playerId, target.productId, target.grantRef);
    if (!outcome.ok) return reply.code(400).send(outcome);
    return { ok: true, newlyGranted: outcome.newlyGranted };
  });

  // A refund or withdrawal: every cosmetic of the product goes, and with it any title it gave.
  app.post("/admin/cosmetics/purchase-revoke", async (request, reply) => {
    const target = await resolve(request, reply);
    if (!target) return reply;
    const product = cosmeticProduct(target.productId);
    for (const cosmeticId of product?.grants ?? []) {
      const outcome = await deps.cosmetics.revoke(target.playerId, cosmeticId);
      if (!outcome.ok) return reply.code(400).send(outcome);
    }
    return { ok: true };
  });
};

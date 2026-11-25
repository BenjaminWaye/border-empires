import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AccountCosmeticsService, CosmeticGrantOutcome } from "./account-cosmetics-service.js";

// Operator-only routes for cosmetic ownership. They accept the static
// ADMIN_API_TOKEN as a Bearer header and nothing else: no player session,
// Firebase sign-in or query-string token reaches them. The payment webhook
// (hosted-sector work) should call `service.grantProduct` directly after
// verifying its own signature instead of going through these routes.
export const registerAccountCosmeticsAdminRoutes = (
  app: FastifyInstance,
  deps: {
    adminAuthorized: (authorization: string | undefined) => boolean;
    cosmetics: Pick<AccountCosmeticsService, "grant" | "grantProduct" | "revoke">;
  }
): void => {
  /** Registers a POST route that, once the admin token checks out and the
   * body carries `playerId` and `idField`, runs `act`. */
  const register = (
    path: string,
    idField: "cosmeticId" | "productId",
    act: (playerId: string, id: string, grantRef: string) => Promise<CosmeticGrantOutcome>
  ): void => {
    app.post(path, async (request: FastifyRequest, reply: FastifyReply) => {
      const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
      if (!deps.adminAuthorized(authorization)) {
        reply.code(401);
        return { ok: false, error: "unauthorized" };
      }
      const body = (request.body ?? {}) as Record<string, unknown>;
      const playerId = body.playerId;
      const id = body[idField];
      if (typeof playerId !== "string" || typeof id !== "string") {
        reply.code(400);
        return { ok: false, error: `playerId and ${idField} are required` };
      }
      const grantRef = typeof body.grantRef === "string" && body.grantRef ? body.grantRef : "admin";
      const outcome = await act(playerId, id, grantRef);
      if (!outcome.ok) reply.code(400);
      return outcome;
    });
  };
  register("/admin/cosmetics/grant", "cosmeticId", (playerId, id, grantRef) => deps.cosmetics.grant(playerId, id, grantRef));
  register("/admin/cosmetics/revoke", "cosmeticId", (playerId, id) => deps.cosmetics.revoke(playerId, id));
  // A whole shop product (COSMETIC_PRODUCTS), as the payment webhook will grant it.
  register("/admin/cosmetics/grant-product", "productId", (playerId, id, grantRef) => deps.cosmetics.grantProduct(playerId, id, grantRef));
};

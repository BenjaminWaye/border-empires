import type { FastifyInstance } from "fastify";

import type { AccountCosmeticsService } from "./account-cosmetics-service.js";

// Operator-only routes for cosmetic ownership. They accept the static
// ADMIN_API_TOKEN as a Bearer header and nothing else: no player session,
// Firebase sign-in or query-string token reaches them. The payment webhook
// (hosted-sector work) should call `service.grant` directly after verifying
// its own signature instead of going through these routes.
export const registerAccountCosmeticsAdminRoutes = (
  app: FastifyInstance,
  deps: {
    adminAuthorized: (authorization: string | undefined) => boolean;
    cosmetics: Pick<AccountCosmeticsService, "grant" | "revoke">;
  }
): void => {
  const register = (path: string, action: "grant" | "revoke"): void => {
    app.post(path, async (request, reply) => {
      const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
      if (!deps.adminAuthorized(authorization)) {
        reply.code(401);
        return { ok: false, error: "unauthorized" };
      }
      const body = (request.body ?? {}) as { playerId?: unknown; cosmeticId?: unknown; grantRef?: unknown };
      if (typeof body.playerId !== "string" || typeof body.cosmeticId !== "string") {
        reply.code(400);
        return { ok: false, error: "playerId and cosmeticId are required" };
      }
      const grantRef = typeof body.grantRef === "string" && body.grantRef ? body.grantRef : "admin";
      const outcome = action === "grant"
        ? await deps.cosmetics.grant(body.playerId, body.cosmeticId, grantRef)
        : await deps.cosmetics.revoke(body.playerId, body.cosmeticId);
      if (!outcome.ok) reply.code(400);
      return outcome;
    });
  };
  register("/admin/cosmetics/grant", "grant");
  register("/admin/cosmetics/revoke", "revoke");
};

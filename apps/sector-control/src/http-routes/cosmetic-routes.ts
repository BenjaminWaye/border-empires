// The shop's purchases (plan section 15, step 8e): start a checkout for a
// cosmetic product, and list this account's orders. Signed-in players only.
import type { FastifyInstance } from "fastify";

import type { CosmeticOrderErrorCode, CosmeticOrders } from "../hosting-cosmetics/cosmetic-orders.js";
import type { HostingAccount } from "../hosting-service/hosting-service.js";

const STATUS_BY_CODE: Record<CosmeticOrderErrorCode, number> = {
  SALES_CLOSED: 503, ACCOUNT_REQUIRED: 403, EMAIL_NOT_VERIFIED: 403, NOT_FOUND: 404, CONSENT_REQUIRED: 400, TERMS_OUTDATED: 409,
  PURCHASES_PAUSED: 403, ALREADY_OWNED: 409, PAYMENT_UNAVAILABLE: 502
};

export const registerCosmeticRoutes = (app: FastifyInstance, deps: { orders: CosmeticOrders; verifyIdToken: (token: string) => Promise<HostingAccount | undefined> }): void => {
  const authenticate = async (authorization: unknown): Promise<HostingAccount | undefined> => {
    const header = typeof authorization === "string" ? authorization : "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    return token ? deps.verifyIdToken(token) : undefined;
  };
  const unauthorized = { ok: false, code: "UNAUTHORIZED", message: "Sign in to continue." };

  app.post("/hosting/cosmetics/orders", async (request, reply) => {
    const account = await authenticate(request.headers.authorization);
    if (!account) return reply.code(401).send(unauthorized);
    const body = (request.body ?? {}) as { productId?: unknown; consent?: unknown };
    const result = await deps.orders.createOrder(account, body.productId, body.consent);
    if (!result.ok) return reply.code(STATUS_BY_CODE[result.code]).send(result);
    return result;
  });

  app.get("/hosting/cosmetics/orders", async (request, reply) => {
    const account = await authenticate(request.headers.authorization);
    if (!account) return reply.code(401).send(unauthorized);
    return { ok: true, orders: deps.orders.listOrders(account) };
  });
};

// HTTP surface of the hosting service, served under /hosting on the API host.
// Every player route needs a Firebase ID token; the payment webhook is
// authenticated by the provider's signature instead.
import { isHostedSectorMapSize, isHostedSectorMapStyle } from "@border-empires/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { HostingAccount, HostingErrorCode, HostingPaymentEvent, HostingService } from "../hosting-service/hosting-service.js";

export type HostingRoutesDeps = {
  service: HostingService;
  /** Verifies a Firebase ID token (signature, issuer, audience, expiry). */
  verifyIdToken: (token: string) => Promise<HostingAccount | undefined>;
  /**
   * Verifies the provider's signature over the raw body and maps the event.
   * Returns "ignored" for a genuine event the service does not act on, and
   * undefined when the signature does not verify.
   */
  parsePaymentWebhook: (rawBody: string, headers: Record<string, string | string[] | undefined>) => Promise<HostingPaymentEvent | "ignored" | undefined>;
  onWebhookRejected?: () => void;
};

const STATUS_BY_CODE: Record<HostingErrorCode, number> = {
  SALES_CLOSED: 503, ACCOUNT_REQUIRED: 403, EMAIL_NOT_VERIFIED: 403, ALREADY_HOSTING: 409, PAYMENT_UNAVAILABLE: 502,
  NOT_FOUND: 404, NOT_HOST: 403, NOT_MEMBER: 403, SECTOR_CLOSED: 409, SECTOR_NOT_READY: 409, SECTOR_FULL: 409,
  INVITE_INVALID: 404, TOO_MANY_INVITES: 429, FUNDING_CLOSED: 409, BAD_AMOUNT: 400, CONSENT_REQUIRED: 400
};

const ID_PATTERN = /^[a-z0-9-]{1,64}$/;

export const registerHostingRoutes = (app: FastifyInstance, deps: HostingRoutesDeps): void => {
  const { service } = deps;

  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<HostingAccount | undefined> => {
    const header = typeof request.headers.authorization === "string" ? request.headers.authorization : "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const account = token ? await deps.verifyIdToken(token) : undefined;
    if (!account) void reply.code(401).send({ ok: false, code: "UNAUTHORIZED", message: "Sign in to continue." });
    return account;
  };

  const send = <T extends { ok: boolean }>(reply: FastifyReply, result: T): T => {
    if (!result.ok) void reply.code(STATUS_BY_CODE[(result as unknown as { code: HostingErrorCode }).code]);
    return result;
  };

  const idParam = (request: FastifyRequest, reply: FastifyReply, name: string): string | undefined => {
    const value = (request.params as Record<string, unknown>)[name];
    if (typeof value === "string" && ID_PATTERN.test(value)) return value;
    void reply.code(404).send({ ok: false, code: "NOT_FOUND", message: "Not found." });
    return undefined;
  };

  app.post("/hosting/orders", async (request, reply) => {
    const account = await authenticate(request, reply);
    if (!account) return reply;
    const body = (request.body ?? {}) as { mapStyle?: unknown; mapSize?: unknown; consent?: unknown };
    if (!isHostedSectorMapStyle(body.mapStyle) || !isHostedSectorMapSize(body.mapSize)) {
      return reply.code(400).send({ ok: false, code: "BAD_OPTIONS", message: "Choose a map type and a map size." });
    }
    return send(reply, await service.createOrder(account, { mapStyle: body.mapStyle, mapSize: body.mapSize }, body.consent));
  });

  // Split funding (plan section 12): open a bar instead of paying in full.
  app.post("/hosting/funding-bars", async (request, reply) => {
    const account = await authenticate(request, reply);
    if (!account) return reply;
    const body = (request.body ?? {}) as { mapStyle?: unknown; mapSize?: unknown };
    if (!isHostedSectorMapStyle(body.mapStyle) || !isHostedSectorMapSize(body.mapSize)) {
      return reply.code(400).send({ ok: false, code: "BAD_OPTIONS", message: "Choose a map type and a map size." });
    }
    return send(reply, service.openFundingBar(account, { mapStyle: body.mapStyle, mapSize: body.mapSize }));
  });

  // A member's share of a funding bar, in cents. The host pays the rest by pledging exactly what is left.
  app.post("/hosting/sectors/:sectorId/contributions", async (request, reply) => {
    const account = await authenticate(request, reply);
    const sectorId = account ? idParam(request, reply, "sectorId") : undefined;
    if (!account || !sectorId) return reply;
    const { amountCents, consent } = (request.body ?? {}) as { amountCents?: unknown; consent?: unknown };
    if (typeof amountCents !== "number") return reply.code(400).send({ ok: false, code: "BAD_AMOUNT", message: "Choose an amount." });
    return send(reply, await service.contribute(account, sectorId, amountCents, consent));
  });

  app.get("/hosting/sectors", async (request, reply) => {
    const account = await authenticate(request, reply);
    if (!account) return reply;
    return { ok: true, sectors: service.listSectors(account) };
  });

  app.get("/hosting/sectors/:sectorId", async (request, reply) => {
    const account = await authenticate(request, reply);
    const sectorId = account ? idParam(request, reply, "sectorId") : undefined;
    if (!account || !sectorId) return reply;
    return send(reply, service.getSector(account, sectorId));
  });

  app.post("/hosting/sectors/:sectorId/invites", async (request, reply) => {
    const account = await authenticate(request, reply);
    const sectorId = account ? idParam(request, reply, "sectorId") : undefined;
    if (!account || !sectorId) return reply;
    return send(reply, service.createInvite(account, sectorId));
  });

  app.post("/hosting/sectors/:sectorId/ticket", async (request, reply) => {
    const account = await authenticate(request, reply);
    const sectorId = account ? idParam(request, reply, "sectorId") : undefined;
    if (!account || !sectorId) return reply;
    return send(reply, await service.issueTicket(account, sectorId));
  });

  app.post("/hosting/invites/:code/accept", async (request, reply) => {
    const account = await authenticate(request, reply);
    const code = account ? idParam(request, reply, "code") : undefined;
    if (!account || !code) return reply;
    return send(reply, service.acceptInvite(account, code));
  });

  app.delete("/hosting/invites/:code", async (request, reply) => {
    const account = await authenticate(request, reply);
    const code = account ? idParam(request, reply, "code") : undefined;
    if (!account || !code) return reply;
    return send(reply, service.revokeInvite(account, code));
  });

  // The signature is computed over the exact bytes sent, so this route (and
  // only this route) reads its body as a raw string.
  app.register(async (webhook) => {
    webhook.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));
    webhook.post("/hosting/payment-webhook", async (request, reply) => {
      const event = await deps.parsePaymentWebhook(typeof request.body === "string" ? request.body : "", request.headers);
      if (!event) {
        deps.onWebhookRejected?.();
        return reply.code(400).send({ ok: false });
      }
      if (event !== "ignored") await service.handlePaymentEvent(event);
      return { ok: true };
    });
  });
};

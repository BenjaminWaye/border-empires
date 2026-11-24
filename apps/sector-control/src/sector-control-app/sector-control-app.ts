// Wires the hosting service together: store, providers, ticket signer, HTTP
// routes and the reconciler loop. main.ts supplies the real database and the
// real ID-token verifier; tests supply their own.
import { randomBytes } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";

import { addCorsHeaders } from "../../../realtime-gateway/src/http-routes/cors-headers.js";
import type { HostingConfig } from "../hosting-service/hosting-config.js";
import { createHostingReconciler } from "../hosting-service/hosting-reconciler.js";
import { createHostingService, type HostingAccount } from "../hosting-service/hosting-service.js";
import type { HostingStore } from "../hosting-store/hosting-store.js";
import { registerHostingRoutes, type HostingRoutesDeps } from "../http-routes/hosting-routes.js";
import type { HostingAlert, PaymentProvider, ServerProvider } from "../providers/providers.js";
import { createSectorTicketSigner } from "../sector-ticket/sector-ticket-signer.js";

export type SectorControlAppOptions = {
  store: HostingStore;
  payment: PaymentProvider;
  servers: ServerProvider;
  config: HostingConfig;
  ticketPrivateKeyPem: string;
  verifyIdToken: (token: string) => Promise<HostingAccount | undefined>;
  parsePaymentWebhook: HostingRoutesDeps["parsePaymentWebhook"];
  reconcileIntervalMs: number;
  alert?: HostingAlert;
  now?: () => number;
  logger?: boolean;
};

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random, lowercase, URL-safe. 36 symbols: each byte is reduced without a noticeable bias for ids of this size. */
export const randomId = (length: number): string => Array.from(randomBytes(length), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");

export const createSectorControlApp = (options: SectorControlAppOptions): { app: FastifyInstance; runReconcilerOnce: () => Promise<void>; startReconciler: () => void; close: () => Promise<void> } => {
  const app = Fastify({ logger: options.logger ?? false });
  const now = options.now ?? (() => Date.now());
  // Until an alert channel is wired (Slack, in a later PR), alerts go to the log at error level so they are not lost.
  const alert: HostingAlert = options.alert ?? ((kind, details) => { app.log.error({ hostingAlert: kind, ...details }, "hosting alert"); });
  const service = createHostingService({
    store: options.store, payment: options.payment, alert, config: options.config, now, newId: randomId,
    signTicket: createSectorTicketSigner({ privateKeyPem: options.ticketPrivateKeyPem, now })
  });
  const reconciler = createHostingReconciler({ store: options.store, payment: options.payment, servers: options.servers, alert, config: options.config, now });

  // The client is served from the play origin and calls this API on the API origin with a bearer token (no cookies).
  addCorsHeaders(app);
  registerHostingRoutes(app, {
    service,
    verifyIdToken: options.verifyIdToken,
    parsePaymentWebhook: options.parsePaymentWebhook,
    onWebhookRejected: () => { app.log.warn("hosting payment webhook rejected: signature did not verify"); }
  });
  app.get("/hosting/health", async () => ({ ok: true, salesEnabled: options.config.salesEnabled, sectors: options.store.countSectorsByState() }));

  let timer: NodeJS.Timeout | undefined;
  let running = false;
  const runReconcilerOnce = async (): Promise<void> => {
    // A slow pass must not overlap the next one.
    if (running) return;
    running = true;
    try {
      await reconciler.runOnce();
    } catch (error) {
      app.log.error({ err: error }, "hosting reconciler pass failed");
    } finally {
      running = false;
    }
  };
  return {
    app,
    runReconcilerOnce,
    startReconciler: () => {
      if (timer) return;
      timer = setInterval(() => { void runReconcilerOnce(); }, options.reconcileIntervalMs);
      void runReconcilerOnce();
    },
    close: async () => {
      if (timer) clearInterval(timer);
      await app.close();
    }
  };
};

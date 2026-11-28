// Wires the hosting service together: store, providers, ticket signer, HTTP
// routes and the reconciler loop. main.ts supplies the real database and the
// real ID-token verifier; tests supply their own.
import { randomBytes } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";

import { addCorsHeaders } from "../../../realtime-gateway/src/http-routes/cors-headers.js";
import type { HostingConfig } from "../hosting-service/hosting-config.js";
import type { HostedResultsStore } from "../hosting-results/hosted-results.js";
import type { HostingEmailOutbox } from "../hosting-email/hosting-email-outbox.js";
import { createHostingMailer, type HostingTermsAttachment } from "../hosting-email/hosting-mailer.js";
import type { HostingEmailTransport } from "../hosting-email/resend-email-transport.js";
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
  /** Where results are saved before a server is deleted (plan step 8d). */
  results?: HostedResultsStore;
  /** Player emails (plan step 8c). Without an outbox none are written; without a transport they wait in it. */
  email?: { outbox: HostingEmailOutbox; transport?: HostingEmailTransport; terms?: HostingTermsAttachment; appUrl: string };
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
  const mailer = options.email
    ? createHostingMailer({ store: options.store, outbox: options.email.outbox, alert, appUrl: options.email.appUrl, now,
      ...(options.email.transport ? { transport: options.email.transport } : {}), ...(options.email.terms ? { terms: options.email.terms } : {}) })
    : undefined;
  const service = createHostingService({
    store: options.store, payment: options.payment, alert, config: options.config, now, newId: randomId,
    signTicket: createSectorTicketSigner({ privateKeyPem: options.ticketPrivateKeyPem, now }),
    // Runs after the purchase or join is stored: a failure here must not turn that success into an error.
    ...(mailer
      ? {
          rememberAddress: (account) => {
            try {
              mailer.rememberAddress(account);
            } catch (error) {
              app.log.error({ err: error }, "hosting email address could not be kept");
            }
          }
        }
      : {})
  });
  const reconciler = createHostingReconciler({
    store: options.store, payment: options.payment, servers: options.servers, alert, config: options.config, now,
    ...(options.results ? { results: options.results } : {}),
    ...(mailer
      ? {
          mailer,
          onSectorOpened: (sector) => {
            try {
              mailer.sectorReady(sector);
            } catch (error) {
              app.log.error({ err: error, sectorId: sector.sectorId }, "hosting ready email could not be written");
            }
          },
          onEmailPass: (result) => {
            if ("error" in result) app.log.error({ hostingEmail: result }, "hosting email pass failed");
            else if (result.sent > 0 || result.pending > 0) app.log.info({ hostingEmail: result }, "hosting emails");
          }
        }
      : {})
  });

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

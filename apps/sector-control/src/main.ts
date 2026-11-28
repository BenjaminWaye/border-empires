import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { createFirebaseTokenVerifier } from "../../realtime-gateway/src/auth-identity/firebase-token-verifier.js";
import { SqliteHostingEmailOutbox } from "./hosting-email/hosting-email-outbox.js";
import { termsAttachment, type HostingTermsAttachment } from "./hosting-email/hosting-mailer.js";
import { createResendEmailTransport } from "./hosting-email/resend-email-transport.js";
import { SqliteHostedResultsStore } from "./hosting-results/hosted-results.js";
import { SqliteHostingStore } from "./hosting-store/sqlite-hosting-store.js";
import { assertSectorTicketKey } from "./sector-ticket/sector-ticket-signer.js";
import { FakePaymentProvider } from "./providers/fake-providers.js";
import { serverProviderFromEnv } from "./providers/server-provider-from-env.js";
import { assertStripeTestMode, createStripeApi } from "./providers/stripe/stripe-api.js";
import { createStripePaymentProvider } from "./providers/stripe/stripe-payment-provider.js";
import { createStripeWebhookParser } from "./providers/stripe/stripe-webhook.js";
import { parseSectorControlRuntimeEnv } from "./runtime-env/runtime-env.js";
import { createSectorControlApp } from "./sector-control-app/sector-control-app.js";

const env = parseSectorControlRuntimeEnv(process.env);
// A key that cannot be read would start a service that takes orders and then fails every entry.
await assertSectorTicketKey(env.ticketPrivateKeyPem);

const db = new DatabaseSync(env.sqlitePath);
db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
const store = new SqliteHostingStore(db);
store.applySchema();
const outbox = new SqliteHostingEmailOutbox(db);
outbox.applySchema();
const results = new SqliteHostedResultsStore(db);
results.applySchema();

/** `relative` in `from` or the nearest folder above it that has it, whether the service runs from src or dist. */
const findUpwards = (relative: string, from: string): string | undefined => {
  for (let dir = from, i = 0; i < 10; i += 1, dir = dirname(dir)) {
    if (existsSync(join(dir, relative))) return join(dir, relative);
    if (dirname(dir) === dir) break;
  }
  return undefined;
};

// Order confirmations carry the Terms of Sale. With emails switched on, a missing file stops the start:
// confirmations would otherwise pile up unsent.
const readTerms = (): HostingTermsAttachment | undefined => {
  const path = env.email.termsHtmlPath ?? findUpwards("docs/legal-drafts/purchase-terms.html", dirname(fileURLToPath(import.meta.url)));
  try {
    if (!path) throw new Error("docs/legal-drafts/purchase-terms.html not found above the service; set HOSTING_TERMS_HTML_PATH");
    return termsAttachment(readFileSync(path, "utf8"));
  } catch (error) {
    if (env.email.resendApiKey) throw new Error(`cannot read the Terms of Sale: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};
const terms = readTerms();

// The same verification the game gateway applies: signature against Google's keys, issuer, audience and expiry.
const verifyFirebaseToken = createFirebaseTokenVerifier({ ...(env.firebaseProjectId ? { projectId: env.firebaseProjectId } : {}) });

// Stripe test mode, or the fake. Stripe is asked at boot whether the key is a live one.
const stripe = env.payment.kind === "stripe-test" ? createStripeApi({ secretKey: env.payment.secretKey }) : undefined;
if (stripe) await assertStripeTestMode(stripe);
const payment = stripe && env.payment.kind === "stripe-test"
  ? {
      provider: createStripePaymentProvider(stripe, { returnOrigin: env.payment.returnOrigin, taxCode: env.payment.taxCode }),
      parseWebhook: createStripeWebhookParser({ api: stripe, webhookSecret: env.payment.webhookSecret })
    }
  // The fake has no signature that could verify: every webhook is refused.
  : { provider: new FakePaymentProvider(), parseWebhook: async () => undefined };

const control = createSectorControlApp({
  store,
  payment: payment.provider,
  // Hetzner creates real servers in the hosted-sectors project; the fake creates none.
  servers: serverProviderFromEnv(env.servers, env.ticketPrivateKeyPem),
  config: env.config,
  ticketPrivateKeyPem: env.ticketPrivateKeyPem,
  reconcileIntervalMs: env.reconcileIntervalMs,
  logger: true,
  verifyIdToken: async (token) => {
    const verified = await verifyFirebaseToken(token);
    if (!verified) return undefined;
    const emailVerified = verified.emailVerified === true;
    return { uid: verified.uid, isGuest: verified.isGuest === true, emailVerified, ...(emailVerified && verified.email ? { email: verified.email } : {}) };
  },
  parsePaymentWebhook: payment.parseWebhook,
  results,
  email: {
    outbox,
    appUrl: env.email.appUrl,
    ...(terms ? { terms } : {}),
    ...(env.email.resendApiKey
      ? { transport: createResendEmailTransport({ apiKey: env.email.resendApiKey, from: env.email.from, ...(env.email.replyTo ? { replyTo: env.email.replyTo } : {}) }) }
      : {})
  }
});

await control.app.listen({ host: env.host, port: env.port });
control.startReconciler();

const shutdown = (): void => {
  void control.close().finally(() => { db.close(); process.exit(0); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

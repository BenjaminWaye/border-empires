import { DatabaseSync } from "node:sqlite";

import { createFirebaseTokenVerifier } from "../../realtime-gateway/src/auth-identity/firebase-token-verifier.js";
import { SqliteHostingStore } from "./hosting-store/sqlite-hosting-store.js";
import { FakePaymentProvider, FakeServerProvider } from "./providers/fake-providers.js";
import { parseSectorControlRuntimeEnv } from "./runtime-env/runtime-env.js";
import { createSectorControlApp } from "./sector-control-app.js";

const env = parseSectorControlRuntimeEnv(process.env);

const db = new DatabaseSync(env.sqlitePath);
db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
const store = new SqliteHostingStore(db);
store.applySchema();

// The same verification the game gateway applies: signature against Google's keys, issuer, audience and expiry.
const verifyFirebaseToken = createFirebaseTokenVerifier({ ...(env.firebaseProjectId ? { projectId: env.firebaseProjectId } : {}) });

const control = createSectorControlApp({
  store,
  payment: new FakePaymentProvider(),
  servers: new FakeServerProvider(),
  config: env.config,
  ticketPrivateKeyPem: env.ticketPrivateKeyPem,
  reconcileIntervalMs: env.reconcileIntervalMs,
  logger: true,
  verifyIdToken: async (token) => {
    const verified = await verifyFirebaseToken(token);
    return verified ? { uid: verified.uid, isGuest: verified.isGuest === true, emailVerified: verified.emailVerified === true } : undefined;
  },
  // No real payment provider yet, so there is no signature that could verify: every webhook is refused.
  parsePaymentWebhook: async () => undefined
});

await control.app.listen({ host: env.host, port: env.port });
control.startReconciler();

const shutdown = (): void => {
  void control.close().finally(() => { db.close(); process.exit(0); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

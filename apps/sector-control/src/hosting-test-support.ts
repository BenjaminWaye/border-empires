// Shared wiring for the hosting service's tests: a real SQLite store in
// memory, fake providers, a real ticket signer and a controllable clock.
import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

import { HOSTED_SECTOR_TERMS_VERSION } from "@border-empires/shared";

import { DEFAULT_HOSTING_CONFIG, type HostingConfig } from "./hosting-service/hosting-config.js";
import { createHostingReconciler } from "./hosting-service/hosting-reconciler.js";
import { createHostingService, type HostingAccount } from "./hosting-service/hosting-service.js";
import { SqliteHostingStore } from "./hosting-store/sqlite-hosting-store.js";
import type { SectorRecord } from "./hosting-store/hosting-store.js";
import { FakePaymentProvider, FakeServerProvider } from "./providers/fake-providers.js";
import type { HostingAlertKind } from "./providers/providers.js";
import { createSectorTicketSigner } from "./sector-ticket/sector-ticket-signer.js";

// vitest (vite) cannot resolve a static import of the built-in node:sqlite; load it at run time.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };

/** Both boxes ticked on the order form, for the current Terms of Sale. */
export const CONSENT = { termsVersion: HOSTED_SECTOR_TERMS_VERSION, acceptedTerms: true, requestedEarlyStart: true } as const;

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const account = (uid: string, overrides: Partial<HostingAccount> = {}): HostingAccount => ({ uid, isGuest: false, emailVerified: true, ...overrides });

export const createHostingHarness = async (configOverrides: Partial<HostingConfig> = {}) => {
  const clock = { now: 1_800_000_000_000 };
  const now = (): number => clock.now;
  const store = new SqliteHostingStore(new DatabaseSync(":memory:"));
  store.applySchema();
  const payment = new FakePaymentProvider();
  const servers = new FakeServerProvider();
  const alerts: Array<{ kind: HostingAlertKind; details: Record<string, string | number> }> = [];
  const opened: SectorRecord[] = [];
  const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const ticketPublicKey = (await exportSPKI(keys.publicKey)).replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const ticketPrivateKeyPem = await exportPKCS8(keys.privateKey);
  const config: HostingConfig = { ...DEFAULT_HOSTING_CONFIG, salesEnabled: true, ...configOverrides };
  let nextId = 0;
  const alert = (kind: HostingAlertKind, details: Record<string, string | number>): void => { alerts.push({ kind, details }); };
  const service = createHostingService({
    store, payment, alert, config, now,
    signTicket: createSectorTicketSigner({ privateKeyPem: ticketPrivateKeyPem, now }),
    newId: (length) => `id${String((nextId += 1)).padStart(length - 2, "0")}`
  });
  const reconciler = createHostingReconciler({ store, payment, servers, alert, config, now, onSectorOpened: (sector) => { opened.push(sector); } });

  /** Orders a standard sector and returns its id. */
  const order = async (uid = "host"): Promise<string> => {
    const result = await service.createOrder(account(uid), { mapStyle: "continents", mapSize: "standard" }, CONSENT);
    if (!result.ok) throw new Error(`order failed: ${result.code}`);
    return result.sector.sectorId;
  };
  /** Orders, pays, and lets the reconciler create a healthy server. */
  const openSector = async (uid = "host"): Promise<string> => {
    const sectorId = await order(uid);
    await service.handlePaymentEvent({ eventId: `evt-paid-${sectorId}`, kind: "paid", sectorId });
    await reconciler.runOnce();
    servers.healthy.add(`${sectorId}.sectors.invalid`);
    await reconciler.runOnce();
    return sectorId;
  };
  return { clock, store, payment, servers, alerts, opened, service, reconciler, config, ticketPublicKey, ticketPrivateKeyPem, order, openSector };
};

// Orders for cosmetic products (plan section 15, step 8e), in the hosting
// database next to the sector orders. They are purchase records: kept as the
// Bookkeeping Act requires, also after the account is deleted.
import type { DatabaseSync } from "node:sqlite";

import type { ConsentRecord } from "../hosting-store/hosting-store.js";

/**
 * awaiting_payment -> paid -> granted. An unpaid checkout ends "cancelled".
 * "refunded" ends a paid or granted order: a full refund, a lost dispute, or
 * the automatic refund when the grant could not be made in time.
 */
export const COSMETIC_ORDER_STATES = ["awaiting_payment", "paid", "granted", "cancelled", "refunded"] as const;
export type CosmeticOrderState = (typeof COSMETIC_ORDER_STATES)[number];

/** An order in these states blocks a second one for the same product. */
export const OPEN_COSMETIC_ORDER_STATES: readonly CosmeticOrderState[] = ["awaiting_payment", "paid", "granted"];

export type CosmeticOrder = {
  orderId: string;
  accountUid: string;
  productId: string;
  amountCents: number;
  currency: string;
  state: CosmeticOrderState;
  paymentRef?: string;
  checkoutUrl?: string;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  grantedAt?: number;
  /** Set once a refunded order's cosmetics have been taken back from the account. */
  revokedAt?: number;
  /** Why a paid order was refunded: "refund", "dispute_lost" or "grant_failed". */
  closeReason?: string;
  grantAttempts: number;
  lastError?: string;
  consent: ConsentRecord;
};

export type CosmeticOrderPatch = {
  state?: CosmeticOrderState;
  paymentRef?: string;
  checkoutUrl?: string;
  paidAt?: number;
  grantedAt?: number;
  revokedAt?: number;
  closeReason?: string;
  grantAttempts?: number;
  lastError?: string | null;
};

type Row = {
  order_id: string; account_uid: string; product_id: string; amount_cents: number; currency: string; state: string;
  payment_ref: string | null; checkout_url: string | null; created_at: number; updated_at: number; paid_at: number | null;
  granted_at: number | null; revoked_at: number | null; close_reason: string | null; grant_attempts: number; last_error: string | null;
  consent_at: number; consent_terms_version: string; consent_text: string;
};

const COLUMNS: Record<keyof CosmeticOrderPatch, string> = {
  state: "state", paymentRef: "payment_ref", checkoutUrl: "checkout_url", paidAt: "paid_at", grantedAt: "granted_at",
  revokedAt: "revoked_at", closeReason: "close_reason", grantAttempts: "grant_attempts", lastError: "last_error"
};

const quoted = (states: readonly string[]): string => states.map((state) => `'${state}'`).join(", ");

const toOrder = (row: Row): CosmeticOrder => {
  if (!(COSMETIC_ORDER_STATES as readonly string[]).includes(row.state)) throw new Error(`cosmetic order ${row.order_id} has unknown state ${row.state}`);
  return {
    orderId: row.order_id,
    accountUid: row.account_uid,
    productId: row.product_id,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    state: row.state as CosmeticOrderState,
    ...(row.payment_ref !== null ? { paymentRef: row.payment_ref } : {}),
    ...(row.checkout_url !== null ? { checkoutUrl: row.checkout_url } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.paid_at !== null ? { paidAt: Number(row.paid_at) } : {}),
    ...(row.granted_at !== null ? { grantedAt: Number(row.granted_at) } : {}),
    ...(row.revoked_at !== null ? { revokedAt: Number(row.revoked_at) } : {}),
    ...(row.close_reason !== null ? { closeReason: row.close_reason } : {}),
    grantAttempts: Number(row.grant_attempts),
    ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    consent: { at: Number(row.consent_at), termsVersion: row.consent_terms_version, text: row.consent_text }
  };
};

export class SqliteCosmeticOrderStore {
  constructor(private readonly db: DatabaseSync) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_cosmetic_orders (
        order_id TEXT PRIMARY KEY,
        account_uid TEXT NOT NULL,
        product_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        state TEXT NOT NULL,
        payment_ref TEXT,
        checkout_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        paid_at INTEGER,
        granted_at INTEGER,
        revoked_at INTEGER,
        close_reason TEXT,
        grant_attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        consent_at INTEGER NOT NULL,
        consent_terms_version TEXT NOT NULL,
        consent_text TEXT NOT NULL
      );
      -- One open order per account and product: the database refuses a second, whatever the caller checked.
      CREATE UNIQUE INDEX IF NOT EXISTS hosted_cosmetic_orders_one_open
        ON hosted_cosmetic_orders (account_uid, product_id) WHERE state IN (${quoted(OPEN_COSMETIC_ORDER_STATES)});
      CREATE INDEX IF NOT EXISTS hosted_cosmetic_orders_state_idx ON hosted_cosmetic_orders (state);
    `);
  }

  /** False when the account already has an open order for this product. */
  insert(order: CosmeticOrder): boolean {
    try {
      this.db
        .prepare(`INSERT INTO hosted_cosmetic_orders (order_id, account_uid, product_id, amount_cents, currency, state, payment_ref, checkout_url, created_at, updated_at,
          paid_at, granted_at, revoked_at, close_reason, grant_attempts, last_error, consent_at, consent_terms_version, consent_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(order.orderId, order.accountUid, order.productId, order.amountCents, order.currency, order.state, order.paymentRef ?? null, order.checkoutUrl ?? null,
          order.createdAt, order.updatedAt, order.paidAt ?? null, order.grantedAt ?? null, order.revokedAt ?? null, order.closeReason ?? null,
          order.grantAttempts, order.lastError ?? null, order.consent.at, order.consent.termsVersion, order.consent.text);
      return true;
    } catch (error) {
      if (error instanceof Error && /UNIQUE/.test(error.message)) return false;
      throw error;
    }
  }

  get(orderId: string): CosmeticOrder | undefined {
    const row = this.db.prepare(`SELECT * FROM hosted_cosmetic_orders WHERE order_id = ?`).get(orderId) as Row | undefined;
    return row ? toOrder(row) : undefined;
  }

  openOrder(accountUid: string, productId: string): CosmeticOrder | undefined {
    const row = this.db
      .prepare(`SELECT * FROM hosted_cosmetic_orders WHERE account_uid = ? AND product_id = ? AND state IN (${quoted(OPEN_COSMETIC_ORDER_STATES)})`)
      .get(accountUid, productId) as Row | undefined;
    return row ? toOrder(row) : undefined;
  }

  listForAccount(accountUid: string, limit = 20): CosmeticOrder[] {
    return (this.db.prepare(`SELECT * FROM hosted_cosmetic_orders WHERE account_uid = ? ORDER BY created_at DESC LIMIT ?`).all(accountUid, limit) as Row[]).map(toOrder);
  }

  /** Orders the reconciler has work for: unpaid, paid and not yet granted, refunded and not yet taken back. */
  listActionable(limit = 100): CosmeticOrder[] {
    return (this.db
      .prepare(`SELECT * FROM hosted_cosmetic_orders WHERE state IN ('awaiting_payment', 'paid') OR (state = 'refunded' AND granted_at IS NOT NULL AND revoked_at IS NULL)
        ORDER BY updated_at LIMIT ?`)
      .all(limit) as Row[]).map(toOrder);
  }

  /** Applies the patch only while the order is in one of `from`; true when it did. */
  transition(orderId: string, from: readonly CosmeticOrderState[], patch: CosmeticOrderPatch, now: number): boolean {
    const entries = Object.entries(patch) as Array<[keyof CosmeticOrderPatch, unknown]>;
    const sets = [...entries.map(([key]) => `${COLUMNS[key]} = ?`), "updated_at = ?"].join(", ");
    const values = entries.map(([, value]) => (value === undefined ? null : (value as string | number | null)));
    const result = this.db
      .prepare(`UPDATE hosted_cosmetic_orders SET ${sets} WHERE order_id = ? AND state IN (${quoted(from)})`)
      .run(...values, now, orderId);
    return Number(result.changes) > 0;
  }
}

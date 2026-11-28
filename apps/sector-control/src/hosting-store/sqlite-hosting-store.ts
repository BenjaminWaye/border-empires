import type { DatabaseSync } from "node:sqlite";

import { isHostedSectorMapSize, isHostedSectorMapStyle } from "@border-empires/shared";

import {
  CONTRIBUTION_STATES,
  LIVE_SECTOR_STATES,
  SECTOR_STATES,
  type ConsentRecord,
  type ContributionPatch,
  type ContributionRecord,
  type ContributionState,
  type HostingStore,
  type SectorInvite,
  type SectorMember,
  type SectorPatch,
  type SectorRecord,
  type SectorState,
  type WithdrawalRecord
} from "./hosting-store.js";

type ConsentColumns = { consent_at: number | null; consent_terms_version: string | null; consent_text: string | null };

/** Columns added after the first release of a table, added in place to an existing database. */
const ADDED_COLUMNS: ReadonlyArray<readonly [table: string, column: string, type: string]> = [
  ["hosted_sectors", "funding_deadline", "INTEGER"],
  ["hosted_sectors", "consent_at", "INTEGER"],
  ["hosted_sectors", "consent_terms_version", "TEXT"],
  ["hosted_sectors", "consent_text", "TEXT"],
  ["hosted_contributions", "consent_at", "INTEGER"],
  ["hosted_contributions", "consent_terms_version", "TEXT"],
  ["hosted_contributions", "consent_text", "TEXT"],
  ["hosted_sectors", "closed_at", "INTEGER"]
];

const toConsent = (row: ConsentColumns): { consent?: ConsentRecord } =>
  row.consent_at !== null && row.consent_terms_version !== null && row.consent_text !== null
    ? { consent: { at: row.consent_at, termsVersion: row.consent_terms_version, text: row.consent_text } }
    : {};

const consentValues = (consent: ConsentRecord | undefined): [number | null, string | null, string | null] =>
  consent ? [consent.at, consent.termsVersion, consent.text] : [null, null, null];

type SectorRow = {
  sector_id: string; host_uid: string; map_style: string; map_size: string; state: string;
  amount_cents: number; currency: string; payment_ref: string | null; checkout_url: string | null;
  server_ref: string | null; hostname: string | null; created_at: number; updated_at: number;
  funding_deadline: number | null; paid_at: number | null; opened_at: number | null; ended_at: number | null;
  create_attempts: number; next_attempt_at: number | null; last_error: string | null; closed_at: number | null;
} & ConsentColumns;
type ContributionRow = {
  contribution_id: string; sector_id: string; account_uid: string; amount_cents: number; state: string;
  payment_ref: string | null; checkout_url: string | null; created_at: number; updated_at: number;
} & ConsentColumns;
type MemberRow = { sector_id: string; account_uid: string; role: string; joined_at: number };
type InviteRow = { code: string; sector_id: string; created_by: string; created_at: number; expires_at: number; revoked_at: number | null };

const SECTOR_COLUMNS =
  "sector_id, host_uid, map_style, map_size, state, amount_cents, currency, payment_ref, checkout_url, server_ref, hostname, " +
  "created_at, updated_at, funding_deadline, paid_at, opened_at, ended_at, create_attempts, next_attempt_at, last_error, " +
  "consent_at, consent_terms_version, consent_text, closed_at";
const CONTRIBUTION_COLUMNS =
  "contribution_id, sector_id, account_uid, amount_cents, state, payment_ref, checkout_url, created_at, updated_at, consent_at, consent_terms_version, consent_text";

const PATCH_COLUMNS: Record<keyof SectorPatch, string> = {
  fundingDeadline: "funding_deadline", state: "state", paymentRef: "payment_ref", checkoutUrl: "checkout_url", serverRef: "server_ref", hostname: "hostname",
  paidAt: "paid_at", openedAt: "opened_at", endedAt: "ended_at", closedAt: "closed_at",
  createAttempts: "create_attempts", nextAttemptAt: "next_attempt_at", lastError: "last_error"
};

const quoted = (states: readonly string[]): string => states.map((state) => `'${state}'`).join(", ");

const toSector = (row: SectorRow): SectorRecord => {
  if (!isHostedSectorMapStyle(row.map_style) || !isHostedSectorMapSize(row.map_size)) throw new Error(`sector ${row.sector_id} has unknown options`);
  if (!(SECTOR_STATES as readonly string[]).includes(row.state)) throw new Error(`sector ${row.sector_id} has unknown state ${row.state}`);
  return {
    sectorId: row.sector_id,
    hostUid: row.host_uid,
    options: { mapStyle: row.map_style, mapSize: row.map_size },
    state: row.state as SectorState,
    amountCents: row.amount_cents,
    currency: row.currency,
    ...(row.payment_ref !== null ? { paymentRef: row.payment_ref } : {}),
    ...(row.checkout_url !== null ? { checkoutUrl: row.checkout_url } : {}),
    ...(row.server_ref !== null ? { serverRef: row.server_ref } : {}),
    ...(row.hostname !== null ? { hostname: row.hostname } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.funding_deadline !== null ? { fundingDeadline: row.funding_deadline } : {}),
    ...(row.paid_at !== null ? { paidAt: row.paid_at } : {}),
    ...(row.opened_at !== null ? { openedAt: row.opened_at } : {}),
    ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
    ...(row.closed_at !== null ? { closedAt: row.closed_at } : {}),
    createAttempts: row.create_attempts,
    ...(row.next_attempt_at !== null ? { nextAttemptAt: row.next_attempt_at } : {}),
    ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    ...toConsent(row)
  };
};

const toContribution = (row: ContributionRow): ContributionRecord => {
  if (!(CONTRIBUTION_STATES as readonly string[]).includes(row.state)) throw new Error(`contribution ${row.contribution_id} has unknown state ${row.state}`);
  return {
    contributionId: row.contribution_id, sectorId: row.sector_id, accountUid: row.account_uid, amountCents: row.amount_cents,
    state: row.state as ContributionState,
    ...(row.payment_ref !== null ? { paymentRef: row.payment_ref } : {}),
    ...(row.checkout_url !== null ? { checkoutUrl: row.checkout_url } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...toConsent(row)
  };
};

const CONTRIBUTION_PATCH_COLUMNS: Record<keyof ContributionPatch, string> = { state: "state", amountCents: "amount_cents", paymentRef: "payment_ref", checkoutUrl: "checkout_url" };

type WithdrawalRow = {
  withdrawal_key: string; sector_id: string; contribution_id: string | null; account_uid: string; payment_ref: string;
  paid_cents: number; deduction_cents: number; refund_cents: number; requested_at: number; refunded_at: number | null;
};

const toWithdrawal = (row: WithdrawalRow): WithdrawalRecord => ({
  withdrawalKey: row.withdrawal_key, sectorId: row.sector_id, ...(row.contribution_id !== null ? { contributionId: row.contribution_id } : {}),
  accountUid: row.account_uid, paymentRef: row.payment_ref, paidCents: row.paid_cents, deductionCents: row.deduction_cents,
  refundCents: row.refund_cents, requestedAt: row.requested_at, ...(row.refunded_at !== null ? { refundedAt: row.refunded_at } : {})
});

const toInvite = (row: InviteRow): SectorInvite => ({
  code: row.code, sectorId: row.sector_id, createdBy: row.created_by, createdAt: row.created_at, expiresAt: row.expires_at,
  ...(row.revoked_at !== null ? { revokedAt: row.revoked_at } : {})
});

export class SqliteHostingStore implements HostingStore {
  constructor(private readonly db: DatabaseSync) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_sectors (
        sector_id TEXT PRIMARY KEY,
        host_uid TEXT NOT NULL,
        map_style TEXT NOT NULL,
        map_size TEXT NOT NULL,
        state TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        payment_ref TEXT,
        checkout_url TEXT,
        server_ref TEXT,
        hostname TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        funding_deadline INTEGER,
        paid_at INTEGER,
        opened_at INTEGER,
        ended_at INTEGER,
        create_attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER,
        last_error TEXT
      );
      -- One live sector per account: the database refuses a second, whatever the caller checked.
      -- Versioned by name: the list of live states is part of the index, so a change needs a new one.
      DROP INDEX IF EXISTS hosted_sectors_one_live_per_host;
      CREATE UNIQUE INDEX IF NOT EXISTS hosted_sectors_one_live_per_host_v2
        ON hosted_sectors (host_uid) WHERE state IN (${quoted(LIVE_SECTOR_STATES)});
      CREATE INDEX IF NOT EXISTS hosted_sectors_state_idx ON hosted_sectors (state);
      CREATE TABLE IF NOT EXISTS hosted_sector_members (
        sector_id TEXT NOT NULL,
        account_uid TEXT NOT NULL,
        role TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (sector_id, account_uid)
      );
      CREATE INDEX IF NOT EXISTS hosted_sector_members_account_idx ON hosted_sector_members (account_uid);
      CREATE TABLE IF NOT EXISTS hosted_sector_invites (
        code TEXT PRIMARY KEY,
        sector_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS hosted_sector_invites_sector_idx ON hosted_sector_invites (sector_id);
      CREATE TABLE IF NOT EXISTS hosted_contributions (
        contribution_id TEXT PRIMARY KEY,
        sector_id TEXT NOT NULL,
        account_uid TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        state TEXT NOT NULL,
        payment_ref TEXT,
        checkout_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS hosted_contributions_sector_idx ON hosted_contributions (sector_id);
      CREATE TABLE IF NOT EXISTS hosted_payment_events (
        event_id TEXT PRIMARY KEY,
        received_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hosted_withdrawals (
        withdrawal_key TEXT PRIMARY KEY,
        sector_id TEXT NOT NULL,
        contribution_id TEXT,
        account_uid TEXT NOT NULL,
        payment_ref TEXT NOT NULL,
        paid_cents INTEGER NOT NULL,
        deduction_cents INTEGER NOT NULL,
        refund_cents INTEGER NOT NULL,
        requested_at INTEGER NOT NULL,
        refunded_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS hosted_withdrawals_pending_idx ON hosted_withdrawals (requested_at) WHERE refunded_at IS NULL;
      CREATE INDEX IF NOT EXISTS hosted_withdrawals_requested_idx ON hosted_withdrawals (requested_at);
      CREATE TABLE IF NOT EXISTS hosted_payment_disputes (
        dispute_id TEXT PRIMARY KEY,
        account_uid TEXT NOT NULL,
        sector_id TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS hosted_payment_disputes_open_idx ON hosted_payment_disputes (account_uid) WHERE closed_at IS NULL;
    `);
    // CREATE TABLE IF NOT EXISTS leaves an existing table as it was, so columns
    // added since are added here, once.
    for (const [table, column, type] of ADDED_COLUMNS) {
      const columns = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((info) => info.name);
      if (!columns.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
    // For the sweep that confirms recent purchases by email (hosting-mailer.ts).
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS hosted_sectors_paid_idx ON hosted_sectors (paid_at) WHERE paid_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS hosted_contributions_updated_idx ON hosted_contributions (updated_at);
    `);
  }

  insertSector(sector: SectorRecord): void {
    this.db
      .prepare(`INSERT INTO hosted_sectors (${SECTOR_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        sector.sectorId, sector.hostUid, sector.options.mapStyle, sector.options.mapSize, sector.state, sector.amountCents, sector.currency,
        sector.paymentRef ?? null, sector.checkoutUrl ?? null, sector.serverRef ?? null, sector.hostname ?? null,
        sector.createdAt, sector.updatedAt, sector.fundingDeadline ?? null, sector.paidAt ?? null, sector.openedAt ?? null, sector.endedAt ?? null,
        sector.createAttempts, sector.nextAttemptAt ?? null, sector.lastError ?? null, ...consentValues(sector.consent), sector.closedAt ?? null
      );
  }

  getSector(sectorId: string): SectorRecord | undefined {
    const row = this.db.prepare(`SELECT ${SECTOR_COLUMNS} FROM hosted_sectors WHERE sector_id = ?`).get(sectorId) as SectorRow | undefined;
    return row ? toSector(row) : undefined;
  }

  transitionSector(sectorId: string, fromStates: readonly SectorState[], patch: SectorPatch, now: number): boolean {
    const assignments = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];
    for (const [key, value] of Object.entries(patch) as Array<[keyof SectorPatch, string | number | null | undefined]>) {
      if (value === undefined) continue;
      assignments.push(`${PATCH_COLUMNS[key]} = ?`);
      values.push(value);
    }
    const result = this.db
      .prepare(`UPDATE hosted_sectors SET ${assignments.join(", ")} WHERE sector_id = ? AND state IN (${quoted(fromStates)})`)
      .run(...values, sectorId);
    return Number(result.changes) > 0;
  }

  liveSectorForHost(hostUid: string): SectorRecord | undefined {
    const row = this.db
      .prepare(`SELECT ${SECTOR_COLUMNS} FROM hosted_sectors WHERE host_uid = ? AND state IN (${quoted(LIVE_SECTOR_STATES)})`)
      .get(hostUid) as SectorRow | undefined;
    return row ? toSector(row) : undefined;
  }

  listSectorsInStates(states: readonly SectorState[]): SectorRecord[] {
    if (states.length === 0) return [];
    const rows = this.db.prepare(`SELECT ${SECTOR_COLUMNS} FROM hosted_sectors WHERE state IN (${quoted(states)}) ORDER BY created_at`).all() as SectorRow[];
    return rows.map(toSector);
  }

  listSectorsForAccount(accountUid: string): SectorRecord[] {
    const columns = SECTOR_COLUMNS.split(", ").map((column) => `s.${column.trim()}`).join(", ");
    const rows = this.db
      .prepare(
        `SELECT ${columns} FROM hosted_sectors s JOIN hosted_sector_members m ON m.sector_id = s.sector_id
         WHERE m.account_uid = ? ORDER BY s.created_at DESC LIMIT 50`
      )
      .all(accountUid) as SectorRow[];
    return rows.map(toSector);
  }

  countSectorsByState(): Record<SectorState, number> {
    const counts = Object.fromEntries(SECTOR_STATES.map((state) => [state, 0])) as Record<SectorState, number>;
    const rows = this.db.prepare(`SELECT state, COUNT(*) AS n FROM hosted_sectors GROUP BY state`).all() as Array<{ state: string; n: number }>;
    for (const row of rows) if (Object.hasOwn(counts, row.state)) counts[row.state as SectorState] = Number(row.n);
    return counts;
  }

  addMember(member: SectorMember): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO hosted_sector_members (sector_id, account_uid, role, joined_at) VALUES (?, ?, ?, ?)`)
      .run(member.sectorId, member.accountUid, member.role, member.joinedAt);
    return Number(result.changes) > 0;
  }

  removeMember(sectorId: string, accountUid: string): boolean {
    return Number(this.db.prepare(`DELETE FROM hosted_sector_members WHERE sector_id = ? AND account_uid = ?`).run(sectorId, accountUid).changes) > 0;
  }

  getMember(sectorId: string, accountUid: string): SectorMember | undefined {
    const row = this.db
      .prepare(`SELECT sector_id, account_uid, role, joined_at FROM hosted_sector_members WHERE sector_id = ? AND account_uid = ?`)
      .get(sectorId, accountUid) as MemberRow | undefined;
    return row ? { sectorId: row.sector_id, accountUid: row.account_uid, role: row.role === "host" ? "host" : "member", joinedAt: row.joined_at } : undefined;
  }

  listMemberUids(sectorId: string): string[] {
    const rows = this.db.prepare(`SELECT account_uid FROM hosted_sector_members WHERE sector_id = ? ORDER BY joined_at`).all(sectorId) as Array<{ account_uid: string }>;
    return rows.map((row) => row.account_uid);
  }

  countMembers(sectorId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM hosted_sector_members WHERE sector_id = ?`).get(sectorId) as { n: number };
    return Number(row.n);
  }

  insertInvite(invite: SectorInvite): void {
    this.db
      .prepare(`INSERT INTO hosted_sector_invites (code, sector_id, created_by, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(invite.code, invite.sectorId, invite.createdBy, invite.createdAt, invite.expiresAt, invite.revokedAt ?? null);
  }

  getInvite(code: string): SectorInvite | undefined {
    const row = this.db
      .prepare(`SELECT code, sector_id, created_by, created_at, expires_at, revoked_at FROM hosted_sector_invites WHERE code = ?`)
      .get(code) as InviteRow | undefined;
    return row ? toInvite(row) : undefined;
  }

  countActiveInvites(sectorId: string, now: number): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM hosted_sector_invites WHERE sector_id = ? AND revoked_at IS NULL AND expires_at > ?`)
      .get(sectorId, now) as { n: number };
    return Number(row.n);
  }

  revokeInvite(code: string, now: number): boolean {
    const result = this.db.prepare(`UPDATE hosted_sector_invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL`).run(now, code);
    return Number(result.changes) > 0;
  }

  insertContribution(contribution: ContributionRecord): void {
    this.db
      .prepare(`INSERT INTO hosted_contributions (${CONTRIBUTION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        contribution.contributionId, contribution.sectorId, contribution.accountUid, contribution.amountCents, contribution.state,
        contribution.paymentRef ?? null, contribution.checkoutUrl ?? null, contribution.createdAt, contribution.updatedAt,
        ...consentValues(contribution.consent)
      );
  }

  getContribution(contributionId: string): ContributionRecord | undefined {
    const row = this.db.prepare(`SELECT ${CONTRIBUTION_COLUMNS} FROM hosted_contributions WHERE contribution_id = ?`).get(contributionId) as ContributionRow | undefined;
    return row ? toContribution(row) : undefined;
  }

  transitionContribution(contributionId: string, fromStates: readonly ContributionState[], patch: ContributionPatch, now: number): boolean {
    const assignments = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];
    for (const [key, value] of Object.entries(patch) as Array<[keyof ContributionPatch, string | number | null | undefined]>) {
      if (value === undefined) continue;
      assignments.push(`${CONTRIBUTION_PATCH_COLUMNS[key]} = ?`);
      values.push(value);
    }
    const result = this.db
      .prepare(`UPDATE hosted_contributions SET ${assignments.join(", ")} WHERE contribution_id = ? AND state IN (${quoted(fromStates)})`)
      .run(...values, contributionId);
    return Number(result.changes) > 0;
  }

  listSectorsPaidSince(since: number): SectorRecord[] {
    return (this.db.prepare(`SELECT ${SECTOR_COLUMNS} FROM hosted_sectors WHERE paid_at >= ? ORDER BY paid_at`).all(since) as SectorRow[]).map(toSector);
  }

  listContributionsChangedSince(states: readonly ContributionState[], since: number): ContributionRecord[] {
    if (states.length === 0) return [];
    const sql = `SELECT ${CONTRIBUTION_COLUMNS} FROM hosted_contributions WHERE state IN (${quoted(states)}) AND updated_at >= ? ORDER BY updated_at`;
    return (this.db.prepare(sql).all(since) as ContributionRow[]).map(toContribution);
  }

  listWithdrawalsSince(since: number): WithdrawalRecord[] {
    return (this.db.prepare(`SELECT * FROM hosted_withdrawals WHERE requested_at >= ? ORDER BY requested_at`).all(since) as WithdrawalRow[]).map(toWithdrawal);
  }

  listContributions(sectorId: string): ContributionRecord[] {
    const rows = this.db.prepare(`SELECT ${CONTRIBUTION_COLUMNS} FROM hosted_contributions WHERE sector_id = ? ORDER BY created_at`).all(sectorId) as ContributionRow[];
    return rows.map(toContribution);
  }

  insertWithdrawal(withdrawal: WithdrawalRecord): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO hosted_withdrawals (withdrawal_key, sector_id, contribution_id, account_uid, payment_ref, paid_cents, deduction_cents, refund_cents, requested_at, refunded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(withdrawal.withdrawalKey, withdrawal.sectorId, withdrawal.contributionId ?? null, withdrawal.accountUid, withdrawal.paymentRef, withdrawal.paidCents,
        withdrawal.deductionCents, withdrawal.refundCents, withdrawal.requestedAt, withdrawal.refundedAt ?? null);
    return Number(result.changes) > 0;
  }

  getWithdrawal(withdrawalKey: string): WithdrawalRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM hosted_withdrawals WHERE withdrawal_key = ?`).get(withdrawalKey) as WithdrawalRow | undefined;
    return row ? toWithdrawal(row) : undefined;
  }

  markWithdrawalRefunded(withdrawalKey: string, at: number): boolean {
    return Number(this.db.prepare(`UPDATE hosted_withdrawals SET refunded_at = ? WHERE withdrawal_key = ? AND refunded_at IS NULL`).run(at, withdrawalKey).changes) > 0;
  }

  listPendingWithdrawals(): WithdrawalRecord[] {
    return (this.db.prepare(`SELECT * FROM hosted_withdrawals WHERE refunded_at IS NULL ORDER BY requested_at`).all() as WithdrawalRow[]).map(toWithdrawal);
  }

  openDispute(dispute: { disputeId: string; accountUid: string; sectorId: string; openedAt: number }): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO hosted_payment_disputes (dispute_id, account_uid, sector_id, opened_at) VALUES (?, ?, ?, ?)`)
      .run(dispute.disputeId, dispute.accountUid, dispute.sectorId, dispute.openedAt);
    return Number(result.changes) > 0;
  }

  closeDispute(disputeId: string, closedAt: number): boolean {
    return Number(this.db.prepare(`UPDATE hosted_payment_disputes SET closed_at = ? WHERE dispute_id = ? AND closed_at IS NULL`).run(closedAt, disputeId).changes) > 0;
  }

  hasOpenDispute(accountUid: string): boolean {
    return this.db.prepare(`SELECT 1 FROM hosted_payment_disputes WHERE account_uid = ? AND closed_at IS NULL`).get(accountUid) !== undefined;
  }

  recordPaymentEvent(eventId: string, now: number): boolean {
    const result = this.db.prepare(`INSERT OR IGNORE INTO hosted_payment_events (event_id, received_at) VALUES (?, ?)`).run(eventId, now);
    return Number(result.changes) > 0;
  }

  hasPaymentEvent(eventId: string): boolean {
    return this.db.prepare(`SELECT 1 FROM hosted_payment_events WHERE event_id = ?`).get(eventId) !== undefined;
  }

  prunePaymentEvents(olderThan: number): number {
    return Number(this.db.prepare(`DELETE FROM hosted_payment_events WHERE received_at < ?`).run(olderThan).changes);
  }
}

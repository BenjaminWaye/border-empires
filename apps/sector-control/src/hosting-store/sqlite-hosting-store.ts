import type { DatabaseSync } from "node:sqlite";

import { isHostedSectorMapSize, isHostedSectorMapStyle } from "@border-empires/shared";

import {
  CONTRIBUTION_STATES,
  LIVE_SECTOR_STATES,
  SECTOR_STATES,
  type ContributionPatch,
  type ContributionRecord,
  type ContributionState,
  type HostingStore,
  type SectorInvite,
  type SectorMember,
  type SectorPatch,
  type SectorRecord,
  type SectorState
} from "./hosting-store.js";

type SectorRow = {
  sector_id: string; host_uid: string; map_style: string; map_size: string; state: string;
  amount_cents: number; currency: string; payment_ref: string | null; checkout_url: string | null;
  server_ref: string | null; hostname: string | null; created_at: number; updated_at: number;
  funding_deadline: number | null; paid_at: number | null; opened_at: number | null; ended_at: number | null;
  create_attempts: number; next_attempt_at: number | null; last_error: string | null;
};
type ContributionRow = {
  contribution_id: string; sector_id: string; account_uid: string; amount_cents: number; state: string;
  payment_ref: string | null; checkout_url: string | null; created_at: number; updated_at: number;
};
type MemberRow = { sector_id: string; account_uid: string; role: string; joined_at: number };
type InviteRow = { code: string; sector_id: string; created_by: string; created_at: number; expires_at: number; revoked_at: number | null };

const SECTOR_COLUMNS =
  "sector_id, host_uid, map_style, map_size, state, amount_cents, currency, payment_ref, checkout_url, server_ref, hostname, " +
  "created_at, updated_at, funding_deadline, paid_at, opened_at, ended_at, create_attempts, next_attempt_at, last_error";
const CONTRIBUTION_COLUMNS = "contribution_id, sector_id, account_uid, amount_cents, state, payment_ref, checkout_url, created_at, updated_at";

const PATCH_COLUMNS: Record<keyof SectorPatch, string> = {
  fundingDeadline: "funding_deadline", state: "state", paymentRef: "payment_ref", checkoutUrl: "checkout_url", serverRef: "server_ref", hostname: "hostname",
  paidAt: "paid_at", openedAt: "opened_at", endedAt: "ended_at",
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
    createAttempts: row.create_attempts,
    ...(row.next_attempt_at !== null ? { nextAttemptAt: row.next_attempt_at } : {}),
    ...(row.last_error !== null ? { lastError: row.last_error } : {})
  };
};

const toContribution = (row: ContributionRow): ContributionRecord => {
  if (!(CONTRIBUTION_STATES as readonly string[]).includes(row.state)) throw new Error(`contribution ${row.contribution_id} has unknown state ${row.state}`);
  return {
    contributionId: row.contribution_id, sectorId: row.sector_id, accountUid: row.account_uid, amountCents: row.amount_cents,
    state: row.state as ContributionState,
    ...(row.payment_ref !== null ? { paymentRef: row.payment_ref } : {}),
    ...(row.checkout_url !== null ? { checkoutUrl: row.checkout_url } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
};

const CONTRIBUTION_PATCH_COLUMNS: Record<keyof ContributionPatch, string> = { state: "state", amountCents: "amount_cents", paymentRef: "payment_ref", checkoutUrl: "checkout_url" };

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
    `);
    // Columns added after the first release of this table. CREATE TABLE IF NOT
    // EXISTS leaves an existing table as it was, so each is added here once.
    const columns = new Set((this.db.prepare("PRAGMA table_info(hosted_sectors)").all() as Array<{ name: string }>).map((column) => column.name));
    if (!columns.has("funding_deadline")) this.db.exec("ALTER TABLE hosted_sectors ADD COLUMN funding_deadline INTEGER");
  }

  insertSector(sector: SectorRecord): void {
    this.db
      .prepare(`INSERT INTO hosted_sectors (${SECTOR_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        sector.sectorId, sector.hostUid, sector.options.mapStyle, sector.options.mapSize, sector.state, sector.amountCents, sector.currency,
        sector.paymentRef ?? null, sector.checkoutUrl ?? null, sector.serverRef ?? null, sector.hostname ?? null,
        sector.createdAt, sector.updatedAt, sector.fundingDeadline ?? null, sector.paidAt ?? null, sector.openedAt ?? null, sector.endedAt ?? null,
        sector.createAttempts, sector.nextAttemptAt ?? null, sector.lastError ?? null
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

  getMember(sectorId: string, accountUid: string): SectorMember | undefined {
    const row = this.db
      .prepare(`SELECT sector_id, account_uid, role, joined_at FROM hosted_sector_members WHERE sector_id = ? AND account_uid = ?`)
      .get(sectorId, accountUid) as MemberRow | undefined;
    return row ? { sectorId: row.sector_id, accountUid: row.account_uid, role: row.role === "host" ? "host" : "member", joinedAt: row.joined_at } : undefined;
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
      .prepare(`INSERT INTO hosted_contributions (${CONTRIBUTION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        contribution.contributionId, contribution.sectorId, contribution.accountUid, contribution.amountCents, contribution.state,
        contribution.paymentRef ?? null, contribution.checkoutUrl ?? null, contribution.createdAt, contribution.updatedAt
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

  listContributions(sectorId: string): ContributionRecord[] {
    const rows = this.db.prepare(`SELECT ${CONTRIBUTION_COLUMNS} FROM hosted_contributions WHERE sector_id = ? ORDER BY created_at`).all(sectorId) as ContributionRow[];
    return rows.map(toContribution);
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

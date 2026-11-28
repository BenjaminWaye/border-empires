// Emails the hosting service owes players (plan section 15, step 8c), kept in
// the same database as the orders so a restart never loses or repeats one.
//
// An email is written here, fully rendered, when the event that calls for it
// is seen; the reconciler sends what is due and retries what failed. Its key
// names the event (for example "order:<sector id>"), so seeing the same event
// again adds nothing. The address is looked up when sending, from the one
// this account last bought or joined with.
//
// Growth: sent and abandoned emails are pruned after a retention period
// (pruneFinished), addresses of accounts with no running sector after
// another (pruneAddresses), and the reconciler logs both counts.
import type { DatabaseSync } from "node:sqlite";

export const HOSTING_EMAIL_KINDS = ["order_confirmation", "share_confirmation", "sector_ready", "idle_warning", "withdrawal_ack"] as const;
export type HostingEmailKind = (typeof HOSTING_EMAIL_KINDS)[number];

/** What is stored for one email. `groupKey` ties together the copies of one notice sent to several members. */
export type NewOutboxEmail = {
  emailKey: string;
  groupKey?: string;
  kind: HostingEmailKind;
  accountUid: string;
  subject: string;
  text: string;
  html: string;
  /** An order confirmation: the version of the Terms of Sale the buyer agreed to, attached when it is sent. */
  attachTermsVersion?: string;
};

export type OutboxEmail = NewOutboxEmail & {
  /** The address of the first attempt, reused for every retry so the email provider sees one request. */
  toAddress?: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  sentAt?: number;
  abandonedAt?: number;
  lastError?: string;
};

export interface HostingEmailOutbox {
  /** The verified address an account bought or joined with; replaced by a newer one. */
  rememberAddress(accountUid: string, email: string, now: number): void;
  getAddress(accountUid: string): string | undefined;
  /** False when an email with this key exists already, sent or not. */
  enqueue(email: NewOutboxEmail, now: number): boolean;
  get(emailKey: string): OutboxEmail | undefined;
  /** When the first email of a group was written and first sent, and how many are still waiting. */
  groupStatus(groupKey: string): { writtenAt?: number; sentAt?: number; pending: number };
  /** Fixes the address on the first attempt. */
  setToAddress(emailKey: string, address: string): void;
  /** Unsent, not abandoned, due by `now`; oldest first. */
  listDue(now: number, limit: number): OutboxEmail[];
  markSent(emailKey: string, now: number): void;
  markRetry(emailKey: string, error: string, nextAttemptAt: number): void;
  markAbandoned(emailKey: string, error: string, now: number): void;
  /** Deletes sent and abandoned emails finished before `olderThan`; returns how many. */
  pruneFinished(olderThan: number): number;
  /**
   * Deletes addresses last used before `olderThan` of accounts that belong to
   * no sector still running or ended (hosted_sector_members); returns how many.
   */
  pruneAddresses(olderThan: number): number;
  /** For account deletion: the address and every unsent email of the account. */
  forgetAccount(accountUid: string): void;
  countPending(): number;
  countAddresses(): number;
}

type OutboxRow = {
  email_key: string;
  group_key: string | null;
  kind: string;
  account_uid: string;
  subject: string;
  text_body: string;
  html_body: string;
  attach_terms: string | null;
  to_address: string | null;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  sent_at: number | null;
  abandoned_at: number | null;
  last_error: string | null;
};

const toEmail = (row: OutboxRow): OutboxEmail => ({
  emailKey: row.email_key,
  ...(row.group_key !== null ? { groupKey: row.group_key } : {}),
  kind: row.kind as HostingEmailKind,
  accountUid: row.account_uid,
  subject: row.subject,
  text: row.text_body,
  html: row.html_body,
  ...(row.attach_terms !== null ? { attachTermsVersion: row.attach_terms } : {}),
  ...(row.to_address !== null ? { toAddress: row.to_address } : {}),
  createdAt: Number(row.created_at),
  attempts: Number(row.attempts),
  nextAttemptAt: Number(row.next_attempt_at),
  ...(row.sent_at !== null ? { sentAt: Number(row.sent_at) } : {}),
  ...(row.abandoned_at !== null ? { abandonedAt: Number(row.abandoned_at) } : {}),
  ...(row.last_error !== null ? { lastError: row.last_error } : {})
});

export class SqliteHostingEmailOutbox implements HostingEmailOutbox {
  constructor(private readonly db: DatabaseSync) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_account_emails (
        account_uid TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hosted_email_outbox (
        email_key TEXT PRIMARY KEY,
        group_key TEXT,
        kind TEXT NOT NULL,
        account_uid TEXT NOT NULL,
        subject TEXT NOT NULL,
        text_body TEXT NOT NULL,
        html_body TEXT NOT NULL,
        attach_terms TEXT,
        to_address TEXT,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        sent_at INTEGER,
        abandoned_at INTEGER,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS hosted_email_outbox_due_idx ON hosted_email_outbox (next_attempt_at) WHERE sent_at IS NULL AND abandoned_at IS NULL;
      CREATE INDEX IF NOT EXISTS hosted_email_outbox_group_idx ON hosted_email_outbox (group_key) WHERE group_key IS NOT NULL;
    `);
  }

  rememberAddress(accountUid: string, email: string, now: number): void {
    this.db
      .prepare(`INSERT INTO hosted_account_emails (account_uid, email, updated_at) VALUES (?, ?, ?) ON CONFLICT (account_uid) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`)
      .run(accountUid, email, now);
  }

  getAddress(accountUid: string): string | undefined {
    const row = this.db.prepare(`SELECT email FROM hosted_account_emails WHERE account_uid = ?`).get(accountUid) as { email: string } | undefined;
    return row?.email;
  }

  enqueue(email: NewOutboxEmail, now: number): boolean {
    const result = this.db
      .prepare(`INSERT OR IGNORE INTO hosted_email_outbox (email_key, group_key, kind, account_uid, subject, text_body, html_body, attach_terms, created_at, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(email.emailKey, email.groupKey ?? null, email.kind, email.accountUid, email.subject, email.text, email.html, email.attachTermsVersion ?? null, now, now);
    return Number(result.changes) > 0;
  }

  get(emailKey: string): OutboxEmail | undefined {
    const row = this.db.prepare(`SELECT * FROM hosted_email_outbox WHERE email_key = ?`).get(emailKey) as OutboxRow | undefined;
    return row ? toEmail(row) : undefined;
  }

  groupStatus(groupKey: string): { writtenAt?: number; sentAt?: number; pending: number } {
    const row = this.db
      .prepare(`SELECT MIN(created_at) AS written, MIN(sent_at) AS sent, SUM(CASE WHEN sent_at IS NULL AND abandoned_at IS NULL THEN 1 ELSE 0 END) AS pending FROM hosted_email_outbox WHERE group_key = ?`)
      .get(groupKey) as { written: number | null; sent: number | null; pending: number | null };
    return {
      ...(row.written !== null ? { writtenAt: Number(row.written) } : {}),
      ...(row.sent !== null ? { sentAt: Number(row.sent) } : {}),
      pending: Number(row.pending ?? 0)
    };
  }

  setToAddress(emailKey: string, address: string): void {
    this.db.prepare(`UPDATE hosted_email_outbox SET to_address = ? WHERE email_key = ? AND to_address IS NULL`).run(address, emailKey);
  }

  listDue(now: number, limit: number): OutboxEmail[] {
    const rows = this.db
      .prepare(`SELECT * FROM hosted_email_outbox WHERE sent_at IS NULL AND abandoned_at IS NULL AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`)
      .all(now, limit) as OutboxRow[];
    return rows.map(toEmail);
  }

  markSent(emailKey: string, now: number): void {
    this.db.prepare(`UPDATE hosted_email_outbox SET sent_at = ?, attempts = attempts + 1, last_error = NULL WHERE email_key = ? AND sent_at IS NULL`).run(now, emailKey);
  }

  markRetry(emailKey: string, error: string, nextAttemptAt: number): void {
    this.db.prepare(`UPDATE hosted_email_outbox SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE email_key = ? AND sent_at IS NULL`).run(error.slice(0, 500), nextAttemptAt, emailKey);
  }

  markAbandoned(emailKey: string, error: string, now: number): void {
    this.db.prepare(`UPDATE hosted_email_outbox SET abandoned_at = ?, last_error = ? WHERE email_key = ? AND sent_at IS NULL`).run(now, error.slice(0, 500), emailKey);
  }

  pruneFinished(olderThan: number): number {
    const result = this.db
      .prepare(`DELETE FROM hosted_email_outbox WHERE (sent_at IS NOT NULL AND sent_at < ?) OR (abandoned_at IS NOT NULL AND abandoned_at < ?)`)
      .run(olderThan, olderThan);
    return Number(result.changes);
  }

  pruneAddresses(olderThan: number): number {
    const result = this.db
      .prepare(`DELETE FROM hosted_account_emails WHERE updated_at < ? AND account_uid NOT IN (
        SELECT m.account_uid FROM hosted_sector_members m JOIN hosted_sectors s ON s.sector_id = m.sector_id
        WHERE s.state IN ('awaiting_payment', 'funding', 'creating', 'open', 'ended'))`)
      .run(olderThan);
    return Number(result.changes);
  }

  forgetAccount(accountUid: string): void {
    this.db.prepare(`DELETE FROM hosted_account_emails WHERE account_uid = ?`).run(accountUid);
    this.db.prepare(`DELETE FROM hosted_email_outbox WHERE account_uid = ? AND sent_at IS NULL`).run(accountUid);
  }

  countAddresses(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM hosted_account_emails`).get() as { n: number };
    return Number(row.n);
  }

  countPending(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM hosted_email_outbox WHERE sent_at IS NULL AND abandoned_at IS NULL`).get() as { n: number };
    return Number(row.n);
  }
}

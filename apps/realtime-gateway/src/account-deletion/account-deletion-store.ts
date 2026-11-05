import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { withGatewaySqliteRetry } from "../sqlite-busy-retry.js";

export const DELETION_COMPLETION_DAYS = 30;
const DAY_MS = 86_400_000;
const MAX_REQUESTS = 10_000;
export type DeletionStatus = "awaiting_identity" | "pending" | "completed";
export interface AccountDeletionRequest {
  requestId: string;
  requestedAt: number;
  completeBy: number;
  status: DeletionStatus;
}
export interface AccountDeletionStore {
  get(uid: string): Promise<AccountDeletionRequest | undefined>;
  request(uid: string, playerId: string): Promise<AccountDeletionRequest>;
  confirmIdentityDeleted(uid: string): Promise<void>;
  isBlocked(uid: string): Promise<boolean>;
  metrics(): Promise<string>;
}
export const deletionUidHash = (uid: string): string => createHash("sha256").update(uid).digest("hex");
type Row = { request_id: string; requested_at: number; status: DeletionStatus };
const publicRequest = (row: Row): AccountDeletionRequest => ({
  requestId: row.request_id, requestedAt: row.requested_at,
  completeBy: row.requested_at + DELETION_COMPLETION_DAYS * DAY_MS, status: row.status
});

/** Durable work queue. Never stores tokens, passwords, email addresses or display names. */
export class SqliteAccountDeletionStore implements AccountDeletionStore {
  private capacityRejections = 0;
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {}

  applySchema(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS account_deletion_requests (
      uid_hash TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
      auth_uid TEXT, player_id TEXT, requested_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_identity', 'pending', 'completed')),
      completed_at INTEGER
    );`);
  }

  async get(uid: string): Promise<AccountDeletionRequest | undefined> {
    const row = await withGatewaySqliteRetry(() => this.db.prepare(
      "SELECT request_id, requested_at, status FROM account_deletion_requests WHERE uid_hash = ?"
    ).get(deletionUidHash(uid)) as Row | undefined);
    return row ? publicRequest(row) : undefined;
  }

  async request(uid: string, playerId: string): Promise<AccountDeletionRequest> {
    return withGatewaySqliteRetry(() => {
      // Completed hashes outlive already-issued one-hour ID tokens. Never
      // evict incomplete work: a network timeout may mask identity deletion.
      this.db.prepare("DELETE FROM account_deletion_requests WHERE status = 'completed' AND completed_at < ?")
        .run(this.now() - 45 * DAY_MS);
      const existing = this.db.prepare("SELECT request_id, requested_at, status FROM account_deletion_requests WHERE uid_hash = ?")
        .get(deletionUidHash(uid)) as Row | undefined;
      if (existing) return publicRequest(existing);
      const count = this.db.prepare("SELECT count(*) AS count FROM account_deletion_requests").get() as { count: number };
      if (count.count >= MAX_REQUESTS) { this.capacityRejections += 1; throw new Error("account deletion queue capacity reached"); }
      const row: Row = { request_id: randomUUID(), requested_at: this.now(), status: "awaiting_identity" };
      this.db.prepare("INSERT INTO account_deletion_requests(uid_hash, request_id, auth_uid, player_id, requested_at, status) VALUES (?, ?, ?, ?, ?, ?)")
        .run(deletionUidHash(uid), row.request_id, uid, playerId, row.requested_at, row.status);
      return publicRequest(row);
    });
  }

  async confirmIdentityDeleted(uid: string): Promise<void> {
    await withGatewaySqliteRetry(() => {
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        this.db.prepare("UPDATE account_deletion_requests SET status = 'pending' WHERE uid_hash = ? AND status = 'awaiting_identity'").run(deletionUidHash(uid));
        // A new Firebase account with the same email must start fresh instead
        // of silently reclaiming the empire awaiting deletion.
        this.db.prepare("UPDATE auth_identity_bindings SET auth_email = NULL WHERE player_id IN (SELECT player_id FROM account_deletion_requests WHERE uid_hash = ? AND status = 'pending')")
          .run(deletionUidHash(uid));
        this.db.exec("COMMIT;");
      } catch (error) { this.db.exec("ROLLBACK;"); throw error; }
    });
  }

  async isBlocked(uid: string): Promise<boolean> {
    const row = await withGatewaySqliteRetry(() => this.db.prepare(`SELECT 1 AS blocked FROM account_deletion_requests
      WHERE status IN ('pending', 'completed') AND (uid_hash = ? OR player_id IN
        (SELECT player_id FROM auth_identity_bindings WHERE auth_uid = ?)) LIMIT 1`).get(deletionUidHash(uid), uid));
    return Boolean(row);
  }

  async metrics(): Promise<string> {
    const rows = await withGatewaySqliteRetry(() => this.db.prepare(`SELECT status, count(*) AS count,
      sum(CASE WHEN requested_at < ? AND status != 'completed' THEN 1 ELSE 0 END) AS overdue
      FROM account_deletion_requests GROUP BY status`).all(this.now() - DELETION_COMPLETION_DAYS * DAY_MS) as Array<{ status: DeletionStatus; count: number; overdue: number }>);
    const count = (status: DeletionStatus): number => rows.find((row) => row.status === status)?.count ?? 0;
    return `\n# TYPE gateway_account_deletion_requests gauge\n` +
      (["awaiting_identity", "pending", "completed"] as const).map((status) => `gateway_account_deletion_requests{status="${status}"} ${count(status)}\n`).join("") +
      `# TYPE gateway_account_deletion_overdue gauge\ngateway_account_deletion_overdue ${rows.reduce((total, row) => total + row.overdue, 0)}\n` +
      `# TYPE gateway_account_deletion_capacity_rejections_total counter\ngateway_account_deletion_capacity_rejections_total ${this.capacityRejections}\n`;
  }
}

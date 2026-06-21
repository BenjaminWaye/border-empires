import type { DatabaseSync } from "node:sqlite";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

type SqliteGatewayCommandStoreOptions = {
  /** Called on each SQLITE_BUSY retry. Wire to gateway_sqlite_retry_total. */
  onRetry?: () => void;
};

const isSqliteBusy = (error: unknown): boolean => {
  const code = (error as { code?: string } | undefined)?.code;
  return code === "SQLITE_BUSY" || code === "SQLITE_BUSY_TIMEOUT";
};

const isSqliteUniqueConstraint = (error: unknown): boolean => {
  const code = (error as { code?: string } | undefined)?.code;
  return code === "SQLITE_CONSTRAINT_UNIQUE";
};

/** Retry backoff for SQLITE_BUSY contention (50ms, 150ms, 300ms). */
const SQLITE_BUSY_RETRY_DELAYS_MS = [50, 150, 300] as const;

import type { GatewayCommandStore, StoredGatewayCommand } from "../command-store/command-store.js";

type Row = {
  command_id: string;
  session_id: string;
  player_id: string;
  client_seq: number;
  command_type: CommandEnvelope["type"];
  payload_json: string;
  queued_at: number;
  status: "QUEUED" | "ACCEPTED" | "REJECTED" | "RESOLVED";
  accepted_at: number | null;
  rejected_at: number | null;
  rejected_code: string | null;
  rejected_message: string | null;
  resolved_at: number | null;
};

const toStored = (row: Row): StoredGatewayCommand => ({
  commandId: row.command_id,
  sessionId: row.session_id,
  playerId: row.player_id,
  clientSeq: row.client_seq,
  type: row.command_type,
  payloadJson: row.payload_json,
  queuedAt: row.queued_at,
  status: row.status,
  ...(row.accepted_at !== null ? { acceptedAt: row.accepted_at } : {}),
  ...(row.rejected_at !== null ? { rejectedAt: row.rejected_at } : {}),
  ...(row.rejected_code !== null ? { rejectedCode: row.rejected_code } : {}),
  ...(row.rejected_message !== null ? { rejectedMessage: row.rejected_message } : {}),
  ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {})
});

const SELECT_JOINED = `
SELECT
  c.command_id, c.session_id, c.player_id, c.client_seq, c.command_type,
  c.payload_json, c.queued_at,
  r.status, r.accepted_at, r.rejected_at, r.rejected_code, r.rejected_message, r.resolved_at
FROM commands c JOIN command_results r ON r.command_id = c.command_id
`;

export class SqliteGatewayCommandStore implements GatewayCommandStore {
  private readonly onRetry: (() => void) | undefined;

  constructor(private readonly db: DatabaseSync, options: SqliteGatewayCommandStoreOptions = {}) {
    this.onRetry = options.onRetry;
  }

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commands (
        command_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        client_seq INTEGER NOT NULL,
        command_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        queued_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS commands_player_seq_idx ON commands (player_id, client_seq);
      CREATE INDEX IF NOT EXISTS commands_player_id_idx ON commands (player_id);
      CREATE TABLE IF NOT EXISTS command_results (
        command_id TEXT PRIMARY KEY REFERENCES commands(command_id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        accepted_at INTEGER,
        rejected_at INTEGER,
        rejected_code TEXT,
        rejected_message TEXT,
        resolved_at INTEGER
      );
    `);
  }

  private async withSqliteRetry<T>(op: () => T): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= SQLITE_BUSY_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return op();
      } catch (error) {
        lastError = error;
        if (!isSqliteBusy(error) || attempt >= SQLITE_BUSY_RETRY_DELAYS_MS.length) {
          throw error;
        }
        this.onRetry?.();
        const delayMs = SQLITE_BUSY_RETRY_DELAYS_MS[attempt];
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }
    throw lastError;
  }

  async persistQueuedCommand(
    command: CommandEnvelope,
    queuedAt: number
  ): Promise<StoredGatewayCommand> {
    const insertCmd = this.db.prepare(
      `INSERT INTO commands (command_id, session_id, player_id, client_seq, command_type, payload_json, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(command_id) DO NOTHING`
    );
    const insertResult = this.db.prepare(
      `INSERT INTO command_results (command_id, status) VALUES (?, 'QUEUED')
       ON CONFLICT(command_id) DO NOTHING`
    );
    try {
      await this.withSqliteRetry(() => {
        this.db.exec("BEGIN");
        try {
          insertCmd.run(command.commandId, command.sessionId, command.playerId, command.clientSeq, command.type, command.payloadJson, queuedAt);
          insertResult.run(command.commandId);
          this.db.exec("COMMIT");
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
      });
    } catch (error) {
      // UNIQUE constraint on (player_id, client_seq) with a different commandId:
      // idempotent re-submission after a reconnect or clientSeq tracking gap.
      // Return the existing stored command rather than surfacing QUEUE_PERSIST_FAILED.
      if (isSqliteUniqueConstraint(error)) {
        const existing = this.db
          .prepare(`${SELECT_JOINED} WHERE c.player_id = ? AND c.client_seq = ? LIMIT 1`)
          .get(command.playerId, command.clientSeq) as Row | undefined;
        if (existing) return toStored(existing);
      }
      throw error;
    }
    const row = this.db
      .prepare(`${SELECT_JOINED} WHERE c.command_id = ? OR (c.player_id = ? AND c.client_seq = ?) LIMIT 1`)
      .get(command.commandId, command.playerId, command.clientSeq) as Row | undefined;
    if (!row) throw new Error("queued command insert returned no row");
    return toStored(row);
  }

  async markAccepted(commandId: string, acceptedAt: number): Promise<void> {
    this.db.prepare(`UPDATE command_results SET status = 'ACCEPTED', accepted_at = ? WHERE command_id = ?`).run(acceptedAt, commandId);
  }

  async markRejected(commandId: string, rejectedAt: number, code: string, message: string): Promise<void> {
    this.db.prepare(`UPDATE command_results SET status = 'REJECTED', rejected_at = ?, rejected_code = ?, rejected_message = ? WHERE command_id = ?`)
      .run(rejectedAt, code, message, commandId);
  }

  async markResolved(commandId: string, resolvedAt: number): Promise<void> {
    this.db.prepare(`UPDATE command_results SET status = 'RESOLVED', resolved_at = ? WHERE command_id = ?`).run(resolvedAt, commandId);
  }

  async get(commandId: string): Promise<StoredGatewayCommand | undefined> {
    const row = this.db.prepare(`${SELECT_JOINED} WHERE c.command_id = ?`).get(commandId) as Row | undefined;
    return row ? toStored(row) : undefined;
  }

  async findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredGatewayCommand | undefined> {
    const row = this.db.prepare(`${SELECT_JOINED} WHERE c.player_id = ? AND c.client_seq = ?`).get(playerId, clientSeq) as Row | undefined;
    return row ? toStored(row) : undefined;
  }

  async listUnresolvedForPlayer(playerId: string): Promise<StoredGatewayCommand[]> {
    const rows = this.db
      .prepare(`${SELECT_JOINED} WHERE c.player_id = ? AND r.status IN ('QUEUED', 'ACCEPTED') ORDER BY c.client_seq ASC`)
      .all(playerId) as Row[];
    return rows.map(toStored);
  }

  async nextClientSeqForPlayer(playerId: string): Promise<number> {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(client_seq), 0) + 1 AS next_seq FROM commands WHERE player_id = ?`)
      .get(playerId) as { next_seq: number };
    return row?.next_seq ?? 1;
  }
}

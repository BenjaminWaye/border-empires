import type { DatabaseSync } from "node:sqlite";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type {
  SimulationCommandStore,
  StoredSimulationCommand,
  StoredSimulationCommandStatus
} from "./command-store/command-store.js";

type Row = {
  command_id: string;
  session_id: string;
  player_id: string;
  client_seq: number;
  command_type: CommandEnvelope["type"];
  payload_json: string;
  queued_at: number;
  status: StoredSimulationCommandStatus;
  accepted_at: number | null;
  rejected_at: number | null;
  rejected_code: string | null;
  rejected_message: string | null;
  resolved_at: number | null;
};

const toStored = (row: Row): StoredSimulationCommand => ({
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

export class SqliteSimulationCommandStore implements SimulationCommandStore {
  constructor(private readonly db: DatabaseSync) {}

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

  async persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<void> {
    const insertCmd = this.db.prepare(
      `INSERT INTO commands (command_id, session_id, player_id, client_seq, command_type, payload_json, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(command_id) DO NOTHING`
    );
    const insertResult = this.db.prepare(
      `INSERT INTO command_results (command_id, status) VALUES (?, 'QUEUED')
       ON CONFLICT(command_id) DO NOTHING`
    );
    this.db.exec("BEGIN");
    try {
      insertCmd.run(command.commandId, command.sessionId, command.playerId, command.clientSeq, command.type, command.payloadJson, queuedAt);
      insertResult.run(command.commandId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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

  async get(commandId: string): Promise<StoredSimulationCommand | undefined> {
    const row = this.db.prepare(`${SELECT_JOINED} WHERE c.command_id = ?`).get(commandId) as Row | undefined;
    return row ? toStored(row) : undefined;
  }

  async findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredSimulationCommand | undefined> {
    const row = this.db.prepare(`${SELECT_JOINED} WHERE c.player_id = ? AND c.client_seq = ?`).get(playerId, clientSeq) as Row | undefined;
    return row ? toStored(row) : undefined;
  }

  async loadRecoverableCommands(): Promise<StoredSimulationCommand[]> {
    const rows = this.db
      .prepare(`${SELECT_JOINED} WHERE r.status IN ('QUEUED', 'ACCEPTED') ORDER BY c.queued_at ASC`)
      .all() as Row[];
    return rows.map(toStored);
  }

  async loadAllCommands(): Promise<StoredSimulationCommand[]> {
    const rows = this.db.prepare(`${SELECT_JOINED} ORDER BY c.queued_at ASC`).all() as Row[];
    return rows.map(toStored);
  }

  async loadMaxClientSeqByPlayer(): Promise<Record<string, number>> {
    // Queries the commands table directly (not the QUEUED/ACCEPTED-filtered
    // recovery view) so resolved/rejected rows still count toward the seq
    // high-water mark — otherwise a producer reseeds low and collides with
    // them via the commands_player_seq_idx UNIQUE index.
    const rows = this.db
      .prepare(`SELECT player_id, MAX(client_seq) AS max_seq FROM commands GROUP BY player_id`)
      .all() as { player_id: string; max_seq: number }[];
    const maxByPlayer: Record<string, number> = {};
    for (const row of rows) maxByPlayer[row.player_id] = row.max_seq;
    return maxByPlayer;
  }
}

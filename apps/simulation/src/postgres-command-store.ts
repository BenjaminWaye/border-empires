import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { SimulationCommandStore, StoredSimulationCommand } from "./command-store.js";
import { createResilientPostgresPool } from "./postgres-pool.js";

type QueryResultRow = Record<string, unknown>;

type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type CommandRow = {
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

const toStoredSimulationCommand = (row: CommandRow): StoredSimulationCommand => ({
  commandId: row.command_id,
  sessionId: row.session_id,
  playerId: row.player_id,
  clientSeq: row.client_seq,
  type: row.command_type,
  payloadJson: row.payload_json,
  queuedAt: row.queued_at,
  status: row.status,
  ...(typeof row.accepted_at === "number" ? { acceptedAt: row.accepted_at } : {}),
  ...(typeof row.rejected_at === "number" ? { rejectedAt: row.rejected_at } : {}),
  ...(typeof row.rejected_code === "string" ? { rejectedCode: row.rejected_code } : {}),
  ...(typeof row.rejected_message === "string" ? { rejectedMessage: row.rejected_message } : {}),
  ...(typeof row.resolved_at === "number" ? { resolvedAt: row.resolved_at } : {})
});

const selectCommandSql = `
SELECT
  c.command_id,
  c.session_id,
  c.player_id,
  c.client_seq,
  c.command_type,
  c.payload_json::text AS payload_json,
  c.queued_at,
  r.status,
  r.accepted_at,
  r.rejected_at,
  r.rejected_code,
  r.rejected_message,
  r.resolved_at
FROM commands c
JOIN command_results r ON r.command_id = c.command_id
`;

export class PostgresSimulationCommandStore implements SimulationCommandStore {
  constructor(private readonly db: Queryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<void> {
    await this.db.query("BEGIN");
    try {
      const inserted = await this.db.query<{ command_id: string }>(
        `
        INSERT INTO commands (
          command_id,
          session_id,
          player_id,
          client_seq,
          command_type,
          payload_json,
          queued_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        ON CONFLICT (command_id) DO NOTHING
        RETURNING command_id
        `,
        [
          command.commandId,
          command.sessionId,
          command.playerId,
          command.clientSeq,
          command.type,
          command.payloadJson,
          queuedAt
        ]
      );
      if ((inserted.rowCount ?? 0) > 0) {
        await this.db.query(
          `
          INSERT INTO command_results (command_id, status)
          VALUES ($1, 'QUEUED')
          ON CONFLICT (command_id) DO NOTHING
          `,
          [command.commandId]
        );
      }
      await this.db.query("COMMIT");
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }

  async markAccepted(commandId: string, acceptedAt: number): Promise<void> {
    await this.db.query(
      `
      UPDATE command_results
      SET status = 'ACCEPTED', accepted_at = $2
      WHERE command_id = $1
      `,
      [commandId, acceptedAt]
    );
  }

  async markRejected(commandId: string, rejectedAt: number, code: string, message: string): Promise<void> {
    await this.db.query(
      `
      UPDATE command_results
      SET status = 'REJECTED', rejected_at = $2, rejected_code = $3, rejected_message = $4
      WHERE command_id = $1
      `,
      [commandId, rejectedAt, code, message]
    );
  }

  async markResolved(commandId: string, resolvedAt: number): Promise<void> {
    await this.db.query(
      `
      UPDATE command_results
      SET status = 'RESOLVED', resolved_at = $2
      WHERE command_id = $1
      `,
      [commandId, resolvedAt]
    );
  }

  async get(commandId: string): Promise<StoredSimulationCommand | undefined> {
    const result = await this.db.query<CommandRow>(`${selectCommandSql} WHERE c.command_id = $1`, [commandId]);
    return result.rows[0] ? toStoredSimulationCommand(result.rows[0]) : undefined;
  }

  async findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredSimulationCommand | undefined> {
    const result = await this.db.query<CommandRow>(
      `${selectCommandSql} WHERE c.player_id = $1 AND c.client_seq = $2`,
      [playerId, clientSeq]
    );
    return result.rows[0] ? toStoredSimulationCommand(result.rows[0]) : undefined;
  }

  async loadRecoverableCommands(): Promise<StoredSimulationCommand[]> {
    const result = await this.db.query<CommandRow>(
      `${selectCommandSql} WHERE r.status IN ('QUEUED', 'ACCEPTED') ORDER BY c.queued_at ASC`
    );
    return result.rows.map(toStoredSimulationCommand);
  }

  async loadAllCommands(): Promise<StoredSimulationCommand[]> {
    const result = await this.db.query<CommandRow>(`${selectCommandSql} ORDER BY c.queued_at ASC`);
    return result.rows.map(toStoredSimulationCommand);
  }
}

export const createPostgresSimulationCommandStore = (connectionString: string): PostgresSimulationCommandStore =>
  new PostgresSimulationCommandStore(
    createResilientPostgresPool(connectionString, "simulation-command-store")
  );

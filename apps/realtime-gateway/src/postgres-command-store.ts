import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { GatewayCommandStore, StoredGatewayCommand } from "./command-store.js";
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
  client_seq: number | string;
  command_type: CommandEnvelope["type"];
  payload_json: string;
  queued_at: number | string;
  status: "QUEUED" | "ACCEPTED" | "REJECTED" | "RESOLVED";
  accepted_at: number | string | null;
  rejected_at: number | string | null;
  rejected_code: string | null;
  rejected_message: string | null;
  resolved_at: number | string | null;
};

const parseDbNumber = (value: number | string | null | undefined): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toStoredGatewayCommand = (row: CommandRow): StoredGatewayCommand => {
  const acceptedAt = parseDbNumber(row.accepted_at);
  const rejectedAt = parseDbNumber(row.rejected_at);
  const resolvedAt = parseDbNumber(row.resolved_at);

  return {
    commandId: row.command_id,
    sessionId: row.session_id,
    playerId: row.player_id,
    clientSeq: parseDbNumber(row.client_seq) ?? 0,
    type: row.command_type,
    payloadJson: row.payload_json,
    queuedAt: parseDbNumber(row.queued_at) ?? 0,
    status: row.status,
    ...(typeof acceptedAt === "number" ? { acceptedAt } : {}),
    ...(typeof rejectedAt === "number" ? { rejectedAt } : {}),
    ...(typeof row.rejected_code === "string" ? { rejectedCode: row.rejected_code } : {}),
    ...(typeof row.rejected_message === "string" ? { rejectedMessage: row.rejected_message } : {}),
    ...(typeof resolvedAt === "number" ? { resolvedAt } : {})
  };
};

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

export class PostgresGatewayCommandStore implements GatewayCommandStore {
  constructor(private readonly db: Queryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<StoredGatewayCommand> {
    const inserted = await this.db.query<CommandRow>(
      `
      WITH inserted_command AS (
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
        ON CONFLICT DO NOTHING
        RETURNING
          command_id,
          session_id,
          player_id,
          client_seq,
          command_type,
          payload_json::text AS payload_json,
          queued_at
      ),
      inserted_result AS (
        INSERT INTO command_results (command_id, status)
        SELECT command_id, 'QUEUED'
        FROM inserted_command
        ON CONFLICT (command_id) DO NOTHING
      )
      SELECT
        command_id,
        session_id,
        player_id,
        client_seq,
        command_type,
        payload_json,
        queued_at,
        'QUEUED'::text AS status,
        NULL::bigint AS accepted_at,
        NULL::bigint AS rejected_at,
        NULL::text AS rejected_code,
        NULL::text AS rejected_message,
        NULL::bigint AS resolved_at
      FROM inserted_command
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
    if (inserted.rows[0]) {
      return toStoredGatewayCommand(inserted.rows[0]);
    }

    const existing = await this.db.query<CommandRow>(
      `${selectCommandSql} WHERE c.command_id = $1 OR (c.player_id = $2 AND c.client_seq = $3) ORDER BY c.command_id = $1 DESC LIMIT 1`,
      [command.commandId, command.playerId, command.clientSeq]
    );
    if (existing.rows[0]) {
      return toStoredGatewayCommand(existing.rows[0]);
    }

    throw new Error("queued command insert returned no inserted or existing command");
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

  async get(commandId: string): Promise<StoredGatewayCommand | undefined> {
    const result = await this.db.query<CommandRow>(`${selectCommandSql} WHERE c.command_id = $1`, [commandId]);
    return result.rows[0] ? toStoredGatewayCommand(result.rows[0]) : undefined;
  }

  async findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredGatewayCommand | undefined> {
    const result = await this.db.query<CommandRow>(
      `${selectCommandSql} WHERE c.player_id = $1 AND c.client_seq = $2`,
      [playerId, clientSeq]
    );
    return result.rows[0] ? toStoredGatewayCommand(result.rows[0]) : undefined;
  }

  async listUnresolvedForPlayer(playerId: string): Promise<StoredGatewayCommand[]> {
    const result = await this.db.query<CommandRow>(
      `${selectCommandSql} WHERE c.player_id = $1 AND r.status IN ('QUEUED', 'ACCEPTED') ORDER BY c.client_seq ASC`,
      [playerId]
    );
    return result.rows.map(toStoredGatewayCommand);
  }

  async nextClientSeqForPlayer(playerId: string): Promise<number> {
    const result = await this.db.query<{ next_client_seq: number | string }>(
      `SELECT COALESCE(MAX(client_seq), 0) + 1 AS next_client_seq FROM commands WHERE player_id = $1`,
      [playerId]
    );
    return parseDbNumber(result.rows[0]?.next_client_seq) ?? 1;
  }
}

export const createPostgresGatewayCommandStore = (connectionString: string): PostgresGatewayCommandStore =>
  new PostgresGatewayCommandStore(
    createResilientPostgresPool(connectionString, "gateway-command-store")
  );

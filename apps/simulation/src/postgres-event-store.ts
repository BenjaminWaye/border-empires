import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { SimulationEventStore, StoredSimulationEvent } from "./event-store.js";
import { createResilientPostgresPool } from "./postgres-pool.js";

type QueryResultRow = Record<string, unknown>;

type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type EventRow = {
  event_id: number;
  command_id: string;
  player_id: string;
  event_type: SimulationEvent["eventType"];
  event_payload: SimulationEvent;
  created_at: number;
};

const toStoredEvent = (row: EventRow): StoredSimulationEvent => ({
  eventId: row.event_id,
  commandId: row.command_id,
  playerId: row.player_id,
  eventType: row.event_type,
  eventPayload: row.event_payload,
  createdAt: row.created_at
});

export class PostgresSimulationEventStore implements SimulationEventStore {
  constructor(private readonly db: Queryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async appendEvent(event: SimulationEvent, createdAt: number): Promise<void> {
    await this.db.query(
      `
      INSERT INTO world_events (
        command_id,
        player_id,
        event_type,
        event_payload,
        created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [event.commandId, event.playerId, event.eventType, JSON.stringify(event), createdAt]
    );
  }

  async loadAllEvents(): Promise<StoredSimulationEvent[]> {
    const result = await this.db.query<EventRow>(
      `
      SELECT event_id, command_id, player_id, event_type, event_payload, created_at
      FROM world_events
      ORDER BY event_id ASC
      `
    );
    return result.rows.map(toStoredEvent);
  }

  async loadEventsAfter(eventId: number, limit?: number): Promise<StoredSimulationEvent[]> {
    const result = await this.db.query<EventRow>(
      `
      SELECT event_id, command_id, player_id, event_type, event_payload, created_at
      FROM world_events
      WHERE event_id > $1
      ORDER BY event_id ASC
      ${typeof limit === "number" ? "LIMIT $2" : ""}
      `,
      typeof limit === "number" ? [eventId, limit] : [eventId]
    );
    return result.rows.map(toStoredEvent);
  }

  async loadEventsForCommand(commandId: string): Promise<StoredSimulationEvent[]> {
    const result = await this.db.query<EventRow>(
      `
      SELECT event_id, command_id, player_id, event_type, event_payload, created_at
      FROM world_events
      WHERE command_id = $1
      ORDER BY event_id ASC
      `,
      [commandId]
    );
    return result.rows.map(toStoredEvent);
  }

  async loadLatestEventId(): Promise<number> {
    const result = await this.db.query<{ event_id: number | null }>(
      `
      SELECT MAX(event_id) AS event_id
      FROM world_events
      `
    );
    return result.rows[0]?.event_id ?? 0;
  }
}

export const createPostgresSimulationEventStore = (connectionString: string): PostgresSimulationEventStore =>
  new PostgresSimulationEventStore(
    createResilientPostgresPool(connectionString, "simulation-event-store")
  );

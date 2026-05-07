import type { DatabaseSync } from "node:sqlite";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { SimulationEventStore, StoredSimulationEvent } from "./event-store.js";

type Row = {
  event_id: number;
  command_id: string;
  player_id: string;
  event_type: SimulationEvent["eventType"];
  event_payload: string;
  created_at: number;
};

const toStoredEvent = (row: Row): StoredSimulationEvent => ({
  eventId: row.event_id,
  commandId: row.command_id,
  playerId: row.player_id,
  eventType: row.event_type,
  eventPayload: JSON.parse(row.event_payload) as SimulationEvent,
  createdAt: row.created_at
});

export class SqliteSimulationEventStore implements SimulationEventStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS world_events_command_idx ON world_events (command_id, event_id);
      CREATE INDEX IF NOT EXISTS world_events_player_idx ON world_events (player_id, event_id);
    `);
  }

  async appendEvent(event: SimulationEvent, createdAt: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO world_events (command_id, player_id, event_type, event_payload, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(event.commandId, event.playerId, event.eventType, JSON.stringify(event), createdAt);
  }

  async loadAllEvents(): Promise<StoredSimulationEvent[]> {
    const rows = this.db
      .prepare(`SELECT event_id, command_id, player_id, event_type, event_payload, created_at FROM world_events ORDER BY event_id ASC`)
      .all() as Row[];
    return rows.map(toStoredEvent);
  }

  async loadEventsAfter(eventId: number, limit?: number): Promise<StoredSimulationEvent[]> {
    const sql = `SELECT event_id, command_id, player_id, event_type, event_payload, created_at
                 FROM world_events WHERE event_id > ? ORDER BY event_id ASC ${typeof limit === "number" ? "LIMIT ?" : ""}`;
    const stmt = this.db.prepare(sql);
    const rows = (typeof limit === "number" ? stmt.all(eventId, limit) : stmt.all(eventId)) as Row[];
    return rows.map(toStoredEvent);
  }

  async loadEventsForCommand(commandId: string): Promise<StoredSimulationEvent[]> {
    const rows = this.db
      .prepare(`SELECT event_id, command_id, player_id, event_type, event_payload, created_at FROM world_events WHERE command_id = ? ORDER BY event_id ASC`)
      .all(commandId) as Row[];
    return rows.map(toStoredEvent);
  }

  async loadLatestEventId(): Promise<number> {
    const row = this.db.prepare(`SELECT MAX(event_id) AS max_id FROM world_events`).get() as { max_id: number | null };
    return row?.max_id ?? 0;
  }
}

import { describe, expect, it, vi } from "vitest";

import { PostgresSimulationEventStore } from "./postgres-event-store.js";

describe("PostgresSimulationEventStore", () => {
  it("appends events with the expected insert shape", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const store = new PostgresSimulationEventStore({
      async query(sql, params) {
        calls.push({ sql: sql.trim(), params });
        return { rows: [], rowCount: 1 };
      }
    });

    await store.appendEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid command payload"
      },
      1000
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql.split("\n")[0]).toBe("INSERT INTO world_events (");
    expect(calls[0]?.params).toEqual([
      "cmd-1",
      "player-1",
      "COMMAND_REJECTED",
      JSON.stringify({
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "invalid command payload"
      }),
      1000
    ]);
  });

  it("loads stored events from query rows", async () => {
    const store = new PostgresSimulationEventStore({
      async query() {
        return {
          rows: [
            {
              event_id: 7,
              command_id: "cmd-1",
              player_id: "player-1",
              event_type: "COMBAT_RESOLVED",
              event_payload: {
                eventType: "COMBAT_RESOLVED",
                commandId: "cmd-1",
                playerId: "player-1",
                originX: 10,
                originY: 10,
                targetX: 10,
                targetY: 11,
                attackerWon: true
              },
              created_at: 2000
            }
          ],
          rowCount: 1
        };
      }
    });

    await expect(store.loadAllEvents()).resolves.toEqual([
      {
        eventId: 7,
        commandId: "cmd-1",
        playerId: "player-1",
        eventType: "COMBAT_RESOLVED",
        eventPayload: {
          eventType: "COMBAT_RESOLVED",
          commandId: "cmd-1",
          playerId: "player-1",
          originX: 10,
          originY: 10,
          targetX: 10,
          targetY: 11,
          attackerWon: true
        },
        createdAt: 2000
      }
    ]);
  });

  it("loads only events after the provided event id", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          event_id: 8,
          command_id: "cmd-2",
          player_id: "player-1",
          event_type: "COMBAT_RESOLVED",
          event_payload: {
            eventType: "COMBAT_RESOLVED",
            commandId: "cmd-2",
            playerId: "player-1",
            originX: 10,
            originY: 11,
            targetX: 10,
            targetY: 12,
            attackerWon: true
          },
          created_at: 2100
        }
      ],
      rowCount: 1
    }));
    const store = new PostgresSimulationEventStore({ query });

    await expect(store.loadEventsAfter(7)).resolves.toMatchObject([
      { eventId: 8, commandId: "cmd-2", eventType: "COMBAT_RESOLVED", createdAt: 2100 }
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE event_id > $1"), [7]);
  });
});

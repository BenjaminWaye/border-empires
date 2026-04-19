import { describe, expect, it, vi } from "vitest";

import { PostgresSimulationCommandStore } from "./postgres-command-store.js";

describe("PostgresSimulationCommandStore", () => {
  it("writes queued commands transactionally", async () => {
    const queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const store = new PostgresSimulationCommandStore({
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("RETURNING command_id")) {
          return { rows: [{ command_id: "cmd-1" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      })
    });

    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: "{}"
      },
      1_100
    );

    expect(queries.map((entry) => entry.sql.trim().split(/\s+/)[0])).toEqual(["BEGIN", "INSERT", "INSERT", "COMMIT"]);
  });

  it("maps joined command/result rows back into stored commands", async () => {
    const store = new PostgresSimulationCommandStore({
      query: vi.fn(async () => ({
        rows: [
          {
            command_id: "cmd-1",
            session_id: "session-1",
            player_id: "player-1",
            client_seq: 1,
            command_type: "ATTACK",
            payload_json: "{}",
            queued_at: 1_100,
            status: "REJECTED",
            accepted_at: null,
            rejected_at: 1_150,
            rejected_code: "BAD_COMMAND",
            rejected_message: "invalid command payload",
            resolved_at: null
          }
        ],
        rowCount: 1
      }))
    });

    await expect(store.get("cmd-1")).resolves.toMatchObject({
      commandId: "cmd-1",
      status: "REJECTED",
      rejectedCode: "BAD_COMMAND",
      rejectedMessage: "invalid command payload"
    });
  });
});

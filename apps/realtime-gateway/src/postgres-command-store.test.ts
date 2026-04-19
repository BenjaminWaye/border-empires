import { describe, expect, it } from "vitest";

import { PostgresGatewayCommandStore } from "./postgres-command-store.js";

describe("PostgresGatewayCommandStore", () => {
  it("persists queued commands in a single write path", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const store = new PostgresGatewayCommandStore({
      async query(sql, params) {
        calls.push({ sql: sql.trim(), params });
        if (sql.includes("WITH inserted_command AS")) {
          return {
            rows: [
              {
                command_id: "cmd-1",
                session_id: "session-1",
                player_id: "player-1",
                client_seq: 1,
                command_type: "ATTACK",
                payload_json: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
                queued_at: 1001,
                status: "QUEUED",
                accepted_at: null,
                rejected_at: null,
                rejected_code: null,
                rejected_message: null,
                resolved_at: null
              }
            ],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 1 };
      }
    });

    await expect(
      store.persistQueuedCommand(
        {
          commandId: "cmd-1",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          issuedAt: 1000,
          type: "ATTACK",
          payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
        },
        1001
      )
    ).resolves.toMatchObject({
      commandId: "cmd-1",
      clientSeq: 1,
      status: "QUEUED"
    });

    expect(calls.map((call) => call.sql.split("\n")[0])).toEqual(["WITH inserted_command AS ("]);
  });

  it("loads the existing queued command on duplicate player sequence", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const store = new PostgresGatewayCommandStore({
      async query(sql, params) {
        calls.push({ sql: sql.trim(), params });
        if (sql.includes("WITH inserted_command AS")) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              command_id: "cmd-existing",
              session_id: "session-1",
              player_id: "player-1",
              client_seq: 7,
              command_type: "ATTACK",
              payload_json: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
              queued_at: 1300,
              status: "QUEUED",
              accepted_at: null,
              rejected_at: null,
              rejected_code: null,
              rejected_message: null,
              resolved_at: null
            }
          ],
          rowCount: 1
        };
      }
    });

    await expect(
      store.persistQueuedCommand(
        {
          commandId: "cmd-new",
          sessionId: "session-2",
          playerId: "player-1",
          clientSeq: 7,
          issuedAt: 1000,
          type: "ATTACK",
          payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
        },
        1301
      )
    ).resolves.toMatchObject({
      commandId: "cmd-existing",
      clientSeq: 7,
      status: "QUEUED"
    });

    expect(calls).toHaveLength(2);
  });

  it("maps unresolved player commands and next client sequence from query rows", async () => {
    const store = new PostgresGatewayCommandStore({
      async query(sql) {
        if (sql.includes("COALESCE(MAX(client_seq), 0) + 1")) {
          return { rows: [{ next_client_seq: 7 }], rowCount: 1 };
        }
        return {
          rows: [
            {
              command_id: "cmd-1",
              session_id: "session-1",
              player_id: "player-1",
              client_seq: 6,
              command_type: "ATTACK",
              payload_json: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
              queued_at: 1000,
              status: "ACCEPTED",
              accepted_at: 1001,
              rejected_at: null,
              rejected_code: null,
              rejected_message: null,
              resolved_at: null
            }
          ],
          rowCount: 1
        };
      }
    });

    await expect(store.nextClientSeqForPlayer("player-1")).resolves.toBe(7);
    await expect(store.listUnresolvedForPlayer("player-1")).resolves.toEqual([
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 6,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
        queuedAt: 1000,
        status: "ACCEPTED",
        acceptedAt: 1001
      }
    ]);
  });

  it("normalizes string-valued numeric rows from pg", async () => {
    const store = new PostgresGatewayCommandStore({
      async query(sql) {
        if (sql.includes("COALESCE(MAX(client_seq), 0) + 1")) {
          return { rows: [{ next_client_seq: "8" }], rowCount: 1 };
        }
        return {
          rows: [
            {
              command_id: "cmd-2",
              session_id: "session-2",
              player_id: "player-1",
              client_seq: "7",
              command_type: "ATTACK",
              payload_json: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
              queued_at: "1000",
              status: "ACCEPTED",
              accepted_at: "1001",
              rejected_at: null,
              rejected_code: null,
              rejected_message: null,
              resolved_at: null
            }
          ],
          rowCount: 1
        };
      }
    });

    await expect(store.nextClientSeqForPlayer("player-1")).resolves.toBe(8);
    await expect(store.listUnresolvedForPlayer("player-1")).resolves.toEqual([
      {
        commandId: "cmd-2",
        sessionId: "session-2",
        playerId: "player-1",
        clientSeq: 7,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
        queuedAt: 1000,
        status: "ACCEPTED",
        acceptedAt: 1001
      }
    ]);
  });
});

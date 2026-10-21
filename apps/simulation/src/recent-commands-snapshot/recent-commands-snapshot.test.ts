import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { handleGetRecentCommands, type ProtoGetRecentCommandsResponse } from "./recent-commands-snapshot.js";
import { SqliteSimulationCommandStore } from "../sqlite-command-store.js";

type DatabaseSyncCtor = new (path: string) => unknown;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

const createSqliteStore = async (): Promise<SqliteSimulationCommandStore> => {
  const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
  const store = new SqliteSimulationCommandStore(db);
  await store.applySchema();
  return store;
};

const seed = async (store: SqliteSimulationCommandStore | InMemorySimulationCommandStore, count: number): Promise<void> => {
  for (let i = 1; i <= count; i += 1) {
    await store.persistQueuedCommand(
      { commandId: `cmd-${i}`, sessionId: "s", playerId: "ai-1", clientSeq: i, issuedAt: i, type: "EXPAND", payloadJson: "{}" },
      1_000 + i
    );
  }
};

const callHandler = (
  store: SqliteSimulationCommandStore | InMemorySimulationCommandStore,
  limit?: number
): Promise<ProtoGetRecentCommandsResponse> =>
  new Promise((resolve, reject) => {
    handleGetRecentCommands(store, { request: limit === undefined ? {} : { limit } }, (error, response) =>
      error ? reject(error) : resolve(response)
    );
  });

const commandIds = (response: ProtoGetRecentCommandsResponse): string[] =>
  (JSON.parse(response.commands_json ?? "[]") as { commandId: string }[]).map((cmd) => cmd.commandId);

// Regression: GetRecentCommands (behind /admin/debug/ai) used to call
// loadAllCommands() and slice the newest 100 in JS. On staging that pulled the
// whole retention window, payload JSON included, into the sim worker heap and
// OOM'd it (ERR_WORKER_OUT_OF_MEMORY, 2026-10-21) twice in a row.
describe("handleGetRecentCommands", () => {
  it("reads only the newest N rows from SQLite and never loads the full table", async () => {
    const store = await createSqliteStore();
    await seed(store, 20);
    const loadAll = vi.spyOn(store, "loadAllCommands");

    const response = await callHandler(store, 3);

    expect(loadAll).not.toHaveBeenCalled();
    expect(commandIds(response)).toEqual(["cmd-20", "cmd-19", "cmd-18"]);
  });

  it("caps an oversized limit", async () => {
    const store = await createSqliteStore();
    const loadRecent = vi.spyOn(store, "loadRecentCommands");

    await callHandler(store, 1_000_000);

    expect(loadRecent).toHaveBeenCalledWith(500);
  });

  it("defaults to 100 and matches the in-memory store's ordering", async () => {
    const sqlite = await createSqliteStore();
    const memory = new InMemorySimulationCommandStore();
    await seed(sqlite, 120);
    await seed(memory, 120);

    const fromSqlite = commandIds(await callHandler(sqlite));
    const fromMemory = commandIds(await callHandler(memory));

    expect(fromSqlite).toHaveLength(100);
    expect(fromSqlite[0]).toBe("cmd-120");
    expect(fromSqlite.at(-1)).toBe("cmd-21");
    expect(fromMemory).toEqual(fromSqlite);
  });
});

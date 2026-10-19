import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { InMemorySimulationCommandStore } from "./command-store.js";
import { SqliteSimulationCommandStore } from "../sqlite-command-store.js";

type Database = ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => Database };
const command = (commandId: string, type: CommandEnvelope["type"]): CommandEnvelope => ({
  commandId, type, playerId: "ai-1", sessionId: "system-runtime:social", clientSeq: 0, issuedAt: 100,
  payloadJson: JSON.stringify({ targetPlayerId: "ai-2", truced: true })
});

for (const backend of ["memory", "sqlite"] as const) {
  describe(`${backend} social command persistence`, () => {
    it("retains every internal update without consuming the player's client sequence", async () => {
      const db = backend === "sqlite" ? new DatabaseSync(":memory:") : undefined;
      try {
        const store = db ? new SqliteSimulationCommandStore(db) : new InMemorySimulationCommandStore();
        if (store instanceof SqliteSimulationCommandStore) await store.applySchema();
        const commands = [command("truce", "SYNC_TRUCE"), command("break", "SYNC_TRUCE"),
          command("ally", "SYNC_ALLIANCE"), command("terms", "SETTLE_DIPLOMACY_TERMS")];
        for (const cmd of commands) {
          await store.persistQueuedCommand(cmd, 100);
          await store.markResolved(cmd.commandId, 110);
        }
        // Retrying the same command ID must still be idempotent.
        await store.persistQueuedCommand(commands[0]!, 120);
        expect((await store.loadAllCommands()).map(c => c.commandId)).toEqual(commands.map(c => c.commandId));
        expect((await store.loadAllCommands()).every(c => c.status === "RESOLVED")).toBe(true);
        expect(await store.findByPlayerSeq("ai-1", 0)).toBeUndefined();
        const client = { ...command("client-zero", "EXPAND"), sessionId: "session-a" };
        await store.persistQueuedCommand(client, 130);
        expect(await store.findByPlayerSeq("ai-1", 0)).toMatchObject({ commandId: "client-zero" });
        expect((await store.loadMaxClientSeqByPlayer())["ai-1"] ?? 0).toBe(0);
        if (db) await expect(store.persistQueuedCommand({ ...client, commandId: "client-duplicate" }, 140)).rejects.toThrow("UNIQUE");
      } finally { db?.close(); }
    });
  });
}

it("migrates a populated old unique index and preserves rows and client deduplication", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = new SqliteSimulationCommandStore(db);
    await store.applySchema();
    // Recreate the previous production schema with one historical social update.
    db.exec("DROP INDEX commands_player_seq_idx; CREATE UNIQUE INDEX commands_player_seq_idx ON commands(player_id, client_seq)");
    await store.persistQueuedCommand(command("historical-truce", "SYNC_TRUCE"), 100);
    await store.applySchema();
    await store.applySchema(); // Boot migration is repeatable.
    await store.persistQueuedCommand(command("new-truce", "SYNC_TRUCE"), 110);
    expect((await store.loadAllCommands()).map(c => c.commandId)).toEqual(["historical-truce", "new-truce"]);
    // Previous releases can still initialize their schema after duplicate internal
    // sequence-zero rows exist: IF NOT EXISTS keeps the upgraded index intact.
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS commands_player_seq_idx ON commands(player_id, client_seq)");
    const client = { ...command("client", "EXPAND"), clientSeq: 1 };
    await store.persistQueuedCommand(client, 120);
    await expect(store.persistQueuedCommand({ ...client, commandId: "duplicate" }, 130)).rejects.toThrow("UNIQUE");
  } finally { db.close(); }
});

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import { createSimulationService } from "./simulation-service.js";
import { SqliteSimulationCommandStore } from "../sqlite-command-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire — runs
// in the same process but bypasses Vite's module graph. Mirrors
// sqlite-command-store.test.ts.
type DatabaseSyncCtor = new (path: string) => unknown;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

const silentLog = { info: () => undefined, error: () => undefined, warn: () => undefined };

type SubmitRequest = {
  command_id: string;
  session_id: string;
  player_id: string;
  client_seq: number;
  issued_at: number;
  type: string;
  payload_json: string;
};

type RawSimulationClient = {
  SubmitCommand?: (request: SubmitRequest, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  submitCommand?: (request: SubmitRequest, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
};

const packageDefinition = loadSync(
  fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)),
  { keepCase: true, longs: Number, defaults: true, enums: String, oneofs: false }
);

const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: {
    simulation: {
      SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawSimulationClient;
    };
  };
};

const createRawSimulationClient = (address: string) =>
  new proto.border_empires.simulation.SimulationService(address, credentials.createInsecure());

const submitCommand = async (client: RawSimulationClient, request: SubmitRequest): Promise<{ ok: boolean }> => {
  const rpc = client.SubmitCommand ?? client.submitCommand;
  if (!rpc) throw new Error("SubmitCommand RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, request, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
};

const waitForCommandRow = async (
  commandStore: SqliteSimulationCommandStore,
  commandId: string,
  timeoutMs: number
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const all = await commandStore.loadAllCommands();
    if (all.some((command) => command.commandId === commandId)) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for command row ${commandId}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

// Regression for the 2026-07-26 prod log flood: the gateway submits
// WATCH_MUSTER/UNWATCH_MUSTER with clientSeq 0 (they are ephemeral view
// toggles with no per-session sequence), so once any seq-0 row existed for a
// player, EVERY subsequent watch/unwatch hit UNIQUE(player_id, client_seq)
// and logged a constraint violation — ~4/sec during active play. The fix
// exempts these two types from queued-command persistence entirely; this
// test pins that repeated seq-0 submissions produce no rows, no violations,
// and are counted on the skip path. Uses a real SQLite-backed command store
// because the in-memory store silently no-ops on collision instead of
// throwing.
describe("ephemeral view-toggle commands are not persisted", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("repeated seq-0 WATCH/UNWATCH_MUSTER submissions persist nothing and trip no constraint violation", async () => {
    const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
    const commandStore = new SqliteSimulationCommandStore(db);
    await commandStore.applySchema();

    const service = await createSimulationService({
      commandStore,
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);

    const playerId = "player-1";
    const musterSubmissions = [
      { command_id: `watch-muster:session-a:${Date.now()}`, type: "WATCH_MUSTER", payload_json: JSON.stringify({ x: 1, y: 1 }) },
      { command_id: `unwatch-muster:session-a:${Date.now() + 1}`, type: "UNWATCH_MUSTER", payload_json: "{}" },
      { command_id: `unwatch-muster:session-a:${Date.now() + 2}`, type: "UNWATCH_MUSTER", payload_json: "{}" }
    ];
    for (const submission of musterSubmissions) {
      const response = await submitCommand(client, {
        ...submission,
        session_id: "session-a",
        player_id: playerId,
        client_seq: 0,
        issued_at: Date.now()
      });
      expect(response.ok).toBe(true);
    }

    // A durable command submitted AFTER the muster toggles: the persistence
    // queue drains strictly in order, so once this row is visible any
    // would-have-been muster rows must already have been written too —
    // proving their absence is a skip, not a race.
    const durableCommandId = "settle-after-musters";
    await submitCommand(client, {
      command_id: durableCommandId,
      session_id: "session-a",
      player_id: playerId,
      client_seq: 1,
      issued_at: Date.now(),
      type: "SETTLE",
      payload_json: JSON.stringify({ x: 1, y: 1 })
    });
    await waitForCommandRow(commandStore, durableCommandId, 10_000);

    const allCommands = await commandStore.loadAllCommands();
    expect(allCommands.filter((command) => command.type === "WATCH_MUSTER" || command.type === "UNWATCH_MUSTER")).toEqual([]);

    const metrics = service.metricsSnapshot();
    expect(metrics.simEphemeralCommandPersistSkippedTotal).toBe(3);
    expect(metrics.simPersistenceConstraintViolationTotal).toBe(0);
  }, 30_000);
});

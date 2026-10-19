import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import { createSimulationService } from "./simulation-service.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
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

it("persists repeated diplomacy updates through the RPC queue with no constraint violations", async () => {
  const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
  const commandStore = new SqliteSimulationCommandStore(db);
  await commandStore.applySchema();
  const snapshotStore = new InMemorySimulationSnapshotStore();
  const eventStore = new InMemorySimulationEventStore();
  const service = await createSimulationService({ snapshotStore, eventStore, commandStore, host: "127.0.0.1", port: 0, log: silentLog });
  try {
    const { address } = await service.start();
    const client = createRawSimulationClient(address);
    const updates = [
      { type: "SYNC_TRUCE", truced: true }, { type: "SYNC_TRUCE", truced: false },
      { type: "SYNC_ALLIANCE", allied: true }, { type: "SYNC_ALLIANCE", allied: false },
      { type: "SYNC_TRUCE", truced: true }, { type: "SYNC_ALLIANCE", allied: true }
    ];
    for (const [i, update] of updates.entries()) {
      expect(await submitCommand(client, {
        command_id: `social-update-${i}`, type: update.type, session_id: "system-runtime:social",
        player_id: "player-1", client_seq: 0, issued_at: Date.now(),
        payload_json: JSON.stringify({ targetPlayerId: "player-2", ...update })
      })).toMatchObject({ ok: true });
    }
    // The last durable row proves all earlier queue writes have drained.
    await waitForCommandRow(commandStore, "social-update-5", 1000);
    await expect.poll(async () => (await commandStore.get("social-update-5"))?.status).toBe("RESOLVED");
    expect((await commandStore.loadAllCommands()).map(c => c.commandId)).toEqual(updates.map((_, i) => `social-update-${i}`));
    expect(service.metricsSnapshot().simPersistenceConstraintViolationTotal).toBe(0);
  } finally { await service.close(); }
  try {
    const snapshot = await snapshotStore.loadLatestSnapshot();
    expect(snapshot?.snapshotPayload.initialState.players?.find(p => p.id === "player-1")).toMatchObject({
      truces: ["player-2"], allies: ["player-2"]
    });
    const recovered = await createSimulationService({ snapshotStore, eventStore, commandStore, host: "127.0.0.1", port: 0, log: silentLog });
    try { await recovered.start(); } finally { await recovered.close(); }
    expect((await snapshotStore.loadLatestSnapshot())?.snapshotPayload.initialState.players?.find(p => p.id === "player-1")).toMatchObject({
      truces: ["player-2"], allies: ["player-2"]
    });
  } finally { db.close(); }
}, 15_000);

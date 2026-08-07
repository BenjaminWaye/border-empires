import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import { createSimulationService } from "./simulation-service.js";
import { SqliteSimulationCommandStore } from "../sqlite-command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire — runs
// in the same process but bypasses Vite's module graph. Mirrors
// sqlite-command-store.test.ts.
type DatabaseSyncCtor = new (path: string) => unknown;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

const silentLog = { info: () => undefined, error: () => undefined, warn: () => undefined };

type RawSimulationClient = {
  StartNextSeason?: (
    request: { force: boolean; imperial_ward_json: string },
    callback: (error: Error | null, response: { ok: boolean; season_id?: string }) => void
  ) => void;
  startNextSeason?: (
    request: { force: boolean; imperial_ward_json: string },
    callback: (error: Error | null, response: { ok: boolean; season_id?: string }) => void
  ) => void;
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

const startNextSeason = async (client: RawSimulationClient, force: boolean): Promise<{ ok: boolean; seasonId?: string }> => {
  const rpc = client.StartNextSeason ?? client.startNextSeason;
  if (!rpc) throw new Error("StartNextSeason RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { force, imperial_ward_json: "" }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ ok: response.ok, ...(response.season_id ? { seasonId: response.season_id } : {}) });
    });
  });
};

/** Polls until an ai-1 command lands in the real SQLite commands table, or times out. */
const waitForAiCommandCount = async (
  commandStore: SqliteSimulationCommandStore,
  minCount: number,
  timeoutMs: number
): Promise<number> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const all = await commandStore.loadAllCommands();
    const count = all.filter((command) => command.playerId === "ai-1").length;
    if (count >= minCount) return count;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${minCount} ai-1 commands (saw ${count})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

// Regression for the staging crash-loop of 2026-07-14: #920 fixed the boot-time
// client_seq reseed (max(recovered, persisted) + 1) but simulation-service.ts
// only ever queried commandStore.loadMaxClientSeqByPlayer() once, at process
// boot, and closed over that snapshot. AI/system player ids (ai-1, barbarian-1,
// ...) are reused every season within one process's uptime, and the `commands`
// table is a single global insert-only log with no season column — so on the
// *second* season within a process (the first season-rollover reseed), the AI
// producer restarted from the stale boot-time snapshot and reissued client_seq
// values that already existed in the commands table from the season that just
// ended, tripping UNIQUE(player_id, client_seq). Uses a real SQLite-backed
// command store because InMemorySimulationCommandStore silently no-ops on a
// collision instead of throwing, so it can't reproduce this.
describe("season rollover reseeds client_seq from fresh persisted state (not boot-time snapshot)", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it(
    "does not trip a persistence constraint violation when an AI producer restarts on season rollover",
    async () => {
      const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
      const commandStore = new SqliteSimulationCommandStore(db);
      await commandStore.applySchema();

      const service = await createSimulationService({
        commandStore,
        eventStore: new InMemorySimulationEventStore(),
        snapshotStore: new InMemorySimulationSnapshotStore(),
        seasonSummaryStore: new InMemorySeasonSummaryStore(),
        rulesetId: "seasonal-default",
        // Forces the managed-season/ruleset bootstrap path at boot (ai-1,
        // barbarian-1, ...) instead of silently falling back to the default
        // seed world (player-1/player-2) when durable stores are empty.
        requireDurableStartupState: true,
        aiPlayerCount: 1,
        enableAiAutopilot: true,
        enableSystemAutopilot: false,
        useAiWorker: false,
        aiTickMs: 20,
        aiMinCommandIntervalMs: 0,
        host: "127.0.0.1",
        port: 0,
        log: silentLog
      });
      cleanup.push(() => service.close());
      const started = await service.start();
      const client = createRawSimulationClient(started.address);

      // Let season 1's AI producer (seeded fresh at boot, since the commands
      // table starts empty) actually persist at least one real command for
      // ai-1 — this is the row a stale reseed would collide with.
      await waitForAiCommandCount(commandStore, 1, 20_000);

      const rolloverResult = await startNextSeason(client, true);
      expect(rolloverResult.ok).toBe(true);

      // The RPC only resolves once replaceRuntime — which stops season 1's
      // producer via closeAutopilots() before starting season 2's — has fully
      // completed, so season 1 can never add another row past this point.
      // Snapshotting the count here (rather than assuming a fixed target
      // like "2") avoids a false pass: season 1's producer ticks every 20ms
      // for the whole rollover round-trip and could easily have already
      // produced more than one command on its own before rollover finished,
      // which would let a stale "wait for count >= 2" check succeed without
      // season 2's producer ever having run. Any growth past this exact
      // count is unambiguously season 2's doing.
      const countAtRollover = (await commandStore.loadAllCommands()).filter(
        (command) => command.playerId === "ai-1"
      ).length;
      await waitForAiCommandCount(commandStore, countAtRollover + 1, 20_000);

      expect(service.metricsSnapshot().simPersistenceConstraintViolationTotal).toBe(0);
    },
    60_000
  );
});

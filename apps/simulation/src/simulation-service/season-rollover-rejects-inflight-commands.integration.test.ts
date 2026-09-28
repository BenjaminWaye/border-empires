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
  StartNextSeason?: (
    request: { force: boolean; imperial_ward_json: string },
    callback: (error: Error | null, response: { ok: boolean; season_id?: string }) => void
  ) => void;
  startNextSeason?: (
    request: { force: boolean; imperial_ward_json: string },
    callback: (error: Error | null, response: { ok: boolean; season_id?: string }) => void
  ) => void;
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

// Regression for the 2026-09-27 staging crash loop: force=true rollovers
// built the entire next season (worldgen for a ~200k-tile world) with no
// event-loop yields, which blocked the process for 100s+ and tripped the
// 30s-stall watchdog kill before the rollover could ever finish. The fix
// (simulation-service.ts) makes buildBootstrapSeason yield unconditionally,
// which is only safe because seasonRolloverInFlight -- true for the whole
// async duration of startNextSeason, set before any yield point -- now also
// makes SubmitCommand reject outright instead of accepting a command against
// the doomed outgoing runtime and silently discarding it on the swap. This
// test pins that rejection: without it, a command submitted mid-rollover
// would get `{ ok: true }` and then vanish when the new season replaces the
// runtime.
describe("forced season rollover rejects commands submitted while it is in flight", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it(
    "rejects SubmitCommand instead of silently discarding it once a forced rollover has started",
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
        // Forces the managed-season/ruleset worldgen bootstrap (the actually
        // slow path this bug lives in) instead of the tiny default seed
        // world used by most other SubmitCommand tests.
        requireDurableStartupState: true,
        aiPlayerCount: 1,
        enableAiAutopilot: false,
        enableSystemAutopilot: false,
        useAiWorker: false,
        host: "127.0.0.1",
        port: 0,
        log: silentLog
      });
      cleanup.push(() => service.close());
      const started = await service.start();
      const client = createRawSimulationClient(started.address);

      const rolloverPromise = startNextSeason(client, true);

      // buildBootstrapSeason now yields periodically while generating the
      // next season's world, so the rollover stays genuinely in flight (not
      // blocking the event loop) for a real, measurable stretch -- a short
      // fixed delay reliably lands inside that window without needing to
      // hook internal timing.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const rejection = await submitCommand(client, {
        command_id: "race-during-forced-rollover",
        session_id: "session-a",
        player_id: "ai-1",
        client_seq: 0,
        issued_at: Date.now(),
        type: "SETTLE",
        payload_json: JSON.stringify({ x: 1, y: 1 })
      }).then(
        (response) => response,
        (error: Error) => error
      );

      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toMatch(/rollover/i);

      const rolloverResult = await rolloverPromise;
      expect(rolloverResult.ok).toBe(true);

      const persisted = await commandStore.loadAllCommands();
      expect(persisted.some((command) => command.commandId === "race-during-forced-rollover")).toBe(false);
    },
    // Full ruleset worldgen bootstrap; mirrors the timeout budget used by
    // season-rollover-client-seq.integration.test.ts for the same reason
    // (worldgen-coastline-style.ts's refinement loop can retry).
    60_000
  );
});

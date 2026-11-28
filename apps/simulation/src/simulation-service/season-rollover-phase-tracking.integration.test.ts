import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import { createSimulationService } from "./simulation-service.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";
import { InMemorySimulationCommandStore } from "../command-store/command-store.js";

const silentLog = { info: () => undefined, error: () => undefined, warn: () => undefined };

type RawClient = { StartNextSeason: (request: { force: boolean }, callback: (error: Error | null) => void) => void };
const packageDefinition = loadSync(
  fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)),
  { keepCase: true, longs: Number, defaults: true, enums: String, oneofs: false }
);
const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: { simulation: { SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawClient } };
};

// Prod 2026-11-28: starting the next Sector Contest blocked the simulation
// main thread for 5.8s, 3.8s and 12s, and every event_loop_blocked listed no
// rollover work in mainThreadTasks. Each synchronous rollover stage must now be
// a named main-thread task so the next block is attributed.
describe("season rollover main-thread attribution", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("tracks worldgen and runtime-build stages as season_rollover_* main-thread tasks", async () => {
    const phases = new Set<string>();
    const service = await createSimulationService({
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore(),
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      rulesetId: "seasonal-default",
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      onMainThreadTaskActive: (task) => { if (task) phases.add(task.phase); }
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = new proto.border_empires.simulation.SimulationService(started.address, credentials.createInsecure());
    phases.clear();

    await new Promise<void>((resolve, reject) => client.StartNextSeason({ force: true }, (error) => (error ? reject(error) : resolve())));

    for (const phase of [
      "season_rollover_worldgen_terrain_and_clusters",
      "season_rollover_worldgen_fair_spawn_sites",
      "season_rollover_worldgen_tile_assembly",
      "season_rollover_worldgen_resource_networks",
      "season_rollover_worldgen_dock_sea_routes",
      "season_rollover_worldgen_recovered_tiles",
      "season_rollover_runtime_construct",
      "season_rollover_export_state",
      "season_rollover_world_status",
      "season_rollover_current_summary",
      "runtime_replace_repair_infrastructure"
    ]) expect(phases, phase).toContain(phase);
  }, 180_000);
});

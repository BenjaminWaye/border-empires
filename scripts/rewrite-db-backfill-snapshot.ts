import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";
import { PostgresSimulationCommandStore } from "../apps/simulation/src/postgres-command-store.js";
import { PostgresSimulationEventStore } from "../apps/simulation/src/postgres-event-store.js";
import { PostgresSimulationSnapshotStore } from "../apps/simulation/src/postgres-snapshot-store.js";
import { buildSimulationSnapshotSections } from "../apps/simulation/src/snapshot-store.js";
import { loadSimulationStartupRecovery } from "../apps/simulation/src/startup-recovery.js";
import { parseSimulationSeedProfile } from "../apps/simulation/src/seed-state.js";

const connectionString = process.env.DATABASE_URL;
const seedProfile = parseSimulationSeedProfile(process.env.SIMULATION_SEED_PROFILE);

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const main = async (): Promise<void> => {
  const pool = new pg.Pool({ connectionString });
  const commandStore = new PostgresSimulationCommandStore(pool);
  const eventStore = new PostgresSimulationEventStore(pool);
  const snapshotStore = new PostgresSimulationSnapshotStore(pool);

  try {
    const latestSnapshot = await snapshotStore.loadLatestSnapshot();
    const latestEventId = await eventStore.loadLatestEventId();

    if (latestEventId === 0) {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: "no-events" }, null, 2));
      return;
    }

    if (latestSnapshot && latestSnapshot.lastAppliedEventId >= latestEventId) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            skipped: true,
            reason: "snapshot-already-current",
            lastAppliedEventId: latestSnapshot.lastAppliedEventId,
            latestEventId
          },
          null,
          2
        )
      );
      return;
    }

    const recovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore,
      snapshotStore,
      seedProfile
    });

    const snapshotSections = buildSimulationSnapshotSections({
      initialState: recovery.initialState,
      commands: recovery.initialCommandHistory.commands,
      eventsByCommandId: recovery.initialCommandHistory.eventsByCommandId
    });

    await snapshotStore.saveSnapshot({
      lastAppliedEventId: latestEventId,
      snapshotSections,
      createdAt: Date.now()
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          latestEventId,
          recoveredCommandCount: recovery.recoveredCommandCount,
          recoveredEventCount: recovery.recoveredEventCount,
          tileCount: recovery.initialState.tiles.length,
          commandEventGroups: snapshotSections.commandEvents.length
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

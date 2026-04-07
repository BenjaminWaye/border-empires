import { runPlanningStaticReplaySmoke } from "./planning-static-replay.js";

const result = await runPlanningStaticReplaySmoke();

if (!result.startupReady) {
  console.error("Late-game replay failed to reach startup readiness.");
  if (result.logs) console.error(result.logs);
  process.exit(1);
}

if (result.logs.includes("slow ai planning static cache")) {
  console.error("Late-game replay emitted slow ai planning static cache.");
  console.error(result.logs);
  process.exit(1);
}

if (result.maxDebugElapsedMs >= 2_000) {
  console.error(`Late-game replay debug endpoint was too slow: ${result.maxDebugElapsedMs}ms`);
  if (result.logs) console.error(result.logs);
  process.exit(1);
}

if (result.planningSnapshotBreaches.length > 0) {
  console.error("Late-game replay recorded planningSnapshot budget breaches.");
  console.error(JSON.stringify(result.planningSnapshotBreaches, null, 2));
  if (result.logs) console.error(result.logs);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      startupReady: result.startupReady,
      maxDebugElapsedMs: result.maxDebugElapsedMs,
      planningSnapshotBreaches: result.planningSnapshotBreaches.length
    },
    null,
    2
  )
);

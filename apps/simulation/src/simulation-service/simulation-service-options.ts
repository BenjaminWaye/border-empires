// Extracted from simulation-service.ts (a grandfathered oversized file that
// may not grow further, per AGENTS.md's file-line-limit rule) so new options
// have somewhere to land without pushing that file over its line count.
import type { SimulationCommandStore } from "../command-store/command-store.js";
import type { SimulationEventStore } from "../event-store/event-store.js";
import type { SimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import type { SimulationSeedProfile } from "../seed-state/seed-state.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import type { SeasonSummaryStore } from "../season-summary-store.js";
import type { SimulationMapStyle, SimulationRulesetId } from "../season-worldgen/season-worldgen.js";
import type { ActiveMainThreadTask } from "../main-thread-task-tracker/main-thread-task-tracker.js";

export type SimulationServiceOptions = {
  host?: string;
  port?: number;
  sqlitePath?: string;
  applySchema?: boolean;
  checkpointEveryEvents?: number;
  checkpointForceAfterEvents?: number;
  checkpointMaxRssBytes?: number;
  checkpointMaxHeapUsedBytes?: number;
  startupReplayCompactionMinEvents?: number;
  seedProfile?: SimulationSeedProfile;
  rulesetId?: SimulationRulesetId;
  mapStyle?: SimulationMapStyle;
  aiPlayerCount?: number;
  snapshotDir?: string;
  enableAiAutopilot?: boolean;
  aiTickMs?: number;
  aiMinCommandIntervalMs?: number;
  aiMaxEventLoopLagMs?: number;
  enableSystemAutopilot?: boolean;
  systemTickMs?: number;
  globalStatusBroadcastDebounceMs?: number;
  systemPlayerIds?: string[];
  nonCompetitivePlayerIds?: ReadonlySet<string>;
  startupRecoveryTimeoutMs?: number;
  allowSeedRecoveryFallback?: boolean;
  requireDurableStartupState?: boolean;
  useAiWorker?: boolean;
  aiDryRun?: boolean;
  aiMaxCommandsPerTick?: number;
  aiDisableExpand?: boolean;
  aiDisableBuild?: boolean;
  commandStore?: SimulationCommandStore;
  eventStore?: SimulationEventStore;
  snapshotStore?: SimulationSnapshotStore;
  seasonSummaryStore?: SeasonSummaryStore;
  maxSeasonPlayers?: number; // overrides SIMULATION_MAX_SEASON_PLAYERS
  runtimeOptions?: ConstructorParameters<typeof SimulationRuntime>[0];
  log?: Pick<Console, "error" | "info" | "warn">;
  // Fired the instant the sim's mainThreadTasks in-flight phase changes,
  // off-thread from a periodic sampler's reach -- see
  // main-thread-task-tracker.ts's onActiveTaskChanged doc comment. Wired by
  // worker-main.ts to postMessage the in-flight phase to the gateway thread
  // so death-forensics can name what was running during a fatal stall, not
  // just completed phases from before it began.
  onMainThreadTaskActive?: (task: ActiveMainThreadTask | undefined) => void;
};

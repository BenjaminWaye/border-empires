import type { CommandEnvelope, LockedFrontierCombatResult, SimulationEvent } from "@border-empires/sim-protocol";
import type { Terrain } from "@border-empires/shared";
import type { DomainPlayer, DomainStrategicResourceKey, FrontierCommandType } from "@border-empires/game-domain";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import type { RecoveredCommandHistory } from "./command-recovery/command-recovery.js";
import type { RecoveredSimulationState } from "./event-recovery/event-recovery.js";
import type { SimulationSeedProfile } from "./seed-state/seed-state.js";
import type { QueueLane } from "./command-lane/command-lane.js";
import type { VisibilityAuditSample } from "./tile-delta-visibility-filter.js";
import type { buildConnectedTownNetworkForPlayer } from "./economy-network/economy-network.js";

export type RuntimeTileYieldEconomyContext = {
  player: DomainPlayer;
  townNetwork: ReturnType<typeof buildConnectedTownNetworkForPlayer>;
  fedTownKeys: Set<string>;
  firstThreeTownKeys: Set<string>;
  /** Precomputed tile keys of active WATERWORKS structures owned by this player. */
  waterworksKeys: Set<string>;
};

export const UPKEEP_STRATEGIC_KEYS = ["FOOD", "IRON", "CRYSTAL", "SUPPLY"] as const;
export type UpkeepStrategicKey = (typeof UPKEEP_STRATEGIC_KEYS)[number];
export type UpkeepNeed = { gold: number } & Record<UpkeepStrategicKey, number>;

export const hasOutstandingUpkeepNeed = (need: UpkeepNeed): boolean => {
  if (need.gold > 0.0001) return true;
  for (const resource of UPKEEP_STRATEGIC_KEYS) {
    if (need[resource] > 0.0001) return true;
  }
  return false;
};

/**
 * Distinguishes player-issued frontier locks from passive defensive fire
 * (fort auto-attack). The AI strategic planner
 * only blocks on `"player"` locks; counting `"automation"` locks would
 * starve the planner because territory-automation re-locks every ~3 s as
 * long as any valid target stays in range.
 */
export type LockSource = "player" | "automation";

/**
 * Command-id prefix used by every command emitted from territory-automation
 * (fort auto-attack). Live runtime code reads
 * `LockRecord.source` directly; this constant is the back-compat fallback
 * for hydrating snapshots written before `source` existed.
 */
export const TERRITORY_AUTO_COMMAND_PREFIX = "territory-auto:";

/**
 * Session-id prefix every territory-automation `handleFrontierCommand`
 * call uses. Lock creation reads the session id to set `LockRecord.source`,
 * so this is the producer-side contract for "is this lock automation?"
 */
export const TERRITORY_AUTO_SESSION_PREFIX = "system-runtime:territory-automation:";

export const lockSourceFromSessionId = (sessionId: string): LockSource =>
  sessionId.startsWith(TERRITORY_AUTO_SESSION_PREFIX) ? "automation" : "player";

export const lockSourceFromCommandId = (commandId: string): LockSource =>
  commandId.startsWith(TERRITORY_AUTO_COMMAND_PREFIX) ? "automation" : "player";

export type LockRecord = {
  commandId: string;
  playerId: string;
  actionType: FrontierCommandType;
  manpowerCost: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  targetKey: string;
  originKey: string;
  resolvesAt: number;
  source: LockSource;
  combatResolution?: LockedCombatResolution;
  /** Key of the muster tile that funded this attack (may differ from originKey for remote musters). */
  musterSourceKey?: string;
};

export type LockedCombatResolution = {
  result: LockedFrontierCombatResult;
  defenderGoldLoss: number;
  targetRecentlyPillaged: boolean;
};

export type AetherWallDirection = "N" | "E" | "S" | "W";

export type ActiveAetherBridgeView = {
  bridgeId: string;
  ownerId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
  endsAt: number;
};

export type ActiveAetherWallView = {
  wallId: string;
  ownerId: string;
  origin: { x: number; y: number };
  direction: AetherWallDirection;
  length: 1 | 2 | 3;
  startedAt: number;
  endsAt: number;
};

export type SimulationJob = {
  lane: QueueLane;
  run: () => void;
  enqueuedAt: number;
  commandType?: CommandEnvelope["type"];
  scheduling?: "immediate" | "background";
};

export type StrategicResourceKey = DomainStrategicResourceKey;

export type RuntimePlayer = DomainPlayer & {
  manpowerUpdatedAt?: number;
  manpowerCapSnapshot?: number;
};

export type SimulationPersistence = {
  recordCommand: (command: CommandEnvelope) => void;
  recordEvent: (event: SimulationEvent) => void;
  snapshot: () => {
    commands: CommandEnvelope[];
    events: SimulationEvent[];
  };
};

export class InMemorySimulationPersistence implements SimulationPersistence {
  private readonly commands: CommandEnvelope[] = [];
  private readonly events: SimulationEvent[] = [];

  recordCommand(command: CommandEnvelope): void {
    this.commands.push(command);
  }

  recordEvent(event: SimulationEvent): void {
    this.events.push(event);
  }

  snapshot(): { commands: CommandEnvelope[]; events: SimulationEvent[] } {
    return {
      commands: [...this.commands],
      events: [...this.events]
    };
  }
}

export type SimulationRuntimeOptions = {
  now?: () => number;
  persistence?: SimulationPersistence;
  backgroundBatchSize?: number;
  scheduleSoon?: (task: () => void) => void;
  scheduleAfter?: (delayMs: number, task: () => void) => void;
  initialState?: RecoveredSimulationState;
  initialCommandHistory?: RecoveredCommandHistory;
  seedProfile?: SimulationSeedProfile;
  seedTiles?: Map<string, import("@border-empires/game-domain").DomainTileState>;
  seedDocks?: DockRouteDefinition[];
  initialPlayers?: Map<string, RuntimePlayer>;
  mergeSeedTilesWithInitialState?: boolean;
  commandTrace?: (sample: Record<string, unknown>) => void;
  onOwnershipChange?: (sample: {
    tileKey: string;
    x: number;
    y: number;
    previousOwnerId: string | undefined;
    nextOwnerId: string | undefined;
    commandId: string;
    hadTown: boolean;
    hadOwnershipState: string | undefined;
  }) => void;
  onQueueDrain?: (sample: {
    durationMs: number;
    processedJobs: number;
    backgroundJobsProcessed: number;
    yieldedForBackground: boolean;
    processedByLane: Record<QueueLane, number>;
    queueDepthsBefore: Record<QueueLane, number>;
    queueDepthsAfter: Record<QueueLane, number>;
  }) => void;
  onJobApplied?: (sample: {
    lane: QueueLane;
    durationMs: number;
    commandType?: CommandEnvelope["type"];
  }) => void;
  maxTerminalCommandReplayHistory?: number;
  maxPlayerSeqReplayEntries?: number;
  onVisibilityAudit?: (sample: VisibilityAuditSample) => void;
  onCaptureRevealBuilt?: (sample: {
    commandId: string;
    playerId: string;
    tileCount: number;
    durationMs: number;
  }) => void;
  /** Called when a non-FALL shard is collected so the runtime can request an immediate checkpoint. */
  onShardCollected?: () => void;
  /**
   * Phase 4: when this returns true the drain loop skips ai-lane background
   * jobs and yields immediately so that concurrent login exports run uncontested.
   * System-lane jobs still run (they are needed to settle commands mid-export).
   * Called at the head of each drain cycle before touching the background queue.
   */
  shouldPauseBackground?: () => boolean;
  onMusterRemoteAttack?: () => void;
  onMusterRemoteBlocked?: () => void;
  onMusterRemoteBlockedBarbarian?: () => void;
  onAutoFillTiles?: (count: number) => void;
};

export type SimulationTileWireDelta = {
  x: number;
  y: number;
  terrain?: Terrain;
  resource?: string;
  dockId?: string;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  frontierDecayAt?: number | undefined;
  frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
  breachShockUntil?: number | undefined;
  fortJson?: string | undefined;
  observatoryJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined;
  sabotageJson?: string | undefined;
  musterJson?: string | undefined;
  townJson?: string;
  townType?: "MARKET" | "FARMING";
  townName?: string;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  shardSiteJson?: string;
  yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> };
  yieldCap?: { gold: number; strategicEach: number };
};

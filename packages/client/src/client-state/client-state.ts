import { CLIENT_CHANGELOG_STORAGE_KEY } from "../client-changelog/client-changelog.js";
import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY, RENDERER_PROMPT_STORAGE_KEY } from "../client-constants.js";
import { DEVELOPMENT_PROCESS_LIMIT, EMPIRE_STORAGE_FLOOR, MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE, type ChosenTrickleResource } from "@border-empires/shared";
import type { EconomyBreakdown } from "../client-economy-model.js";
import type { ClientShardRainAlert } from "../client-shard-alert/client-shard-alert.js";
import type {
  AllianceRequest,
  ActiveAetherBridgeView,
  ActiveAetherWallView,
  StrategicReplayEvent,
  ActiveTruceView,
  ActiveAllianceBreakView,
  RecentAllianceBreakView,
  CrystalTargetingAbility,
  DockPair,
  DomainInfo,
  EmpireVisualStyle,
  FeedEntry,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  PendingResearch,
  PlayerRespawnNotice,
  RevealEmpireStatsView,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  SurveySweepPing,
  TechInfo,
  Tile,
  TruceRequest,
  TileActionDef,
  TileMenuTab,
  TileTimedProgress,
  OptimisticStructureKind
} from "../client-types.js";
import type { WaypointPlan } from "../client-waypoint-planner/client-waypoint-planner.js";

export type ClientWaypoint = {
  target: { x: number; y: number };
  plan: WaypointPlan;
  // Last tile-key the waypoint asked the action queue to claim. The
  // next top-up compares the planner's new first step against it: a
  // match means ownership has not advanced (either a stale-snapshot
  // race or a real reject), so we wait a few ticks before halting.
  lastEnqueuedKey?: string;
  // Consecutive top-ups where the planner re-emitted the same step we
  // just enqueued. Resets to 0 the moment the plan advances.
  consecutiveRetries?: number;
};

type QueuedOptimisticKind = OptimisticStructureKind;
type QueuedBuildPayload =
  | { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: string }
  | { type: "REMOVE_STRUCTURE"; x: number; y: number };

const SERVER_DEPLOYING_SESSION_KEY = "be:server-deploying-at";
const SERVER_DEPLOYING_WINDOW_MS = 180_000;

export const setServerDeployingSession = (): void => {
  try { sessionStorage.setItem(SERVER_DEPLOYING_SESSION_KEY, String(Date.now())); } catch {}
};

export const clearServerDeployingSession = (): void => {
  try { sessionStorage.removeItem(SERVER_DEPLOYING_SESSION_KEY); } catch {}
};

const checkServerDeployingSession = (): boolean => {
  try {
    const ts = sessionStorage.getItem(SERVER_DEPLOYING_SESSION_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < SERVER_DEPLOYING_WINDOW_MS;
  } catch {
    return false;
  }
};

export const storageGet = (keyName: string): string | null => {
  try {
    return window.localStorage.getItem(keyName);
  } catch {
    return null;
  }
};

export const storageSet = (keyName: string, value: string): void => {
  try {
    window.localStorage.setItem(keyName, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const createInitialState = () => ({
  me: "",
  meName: "",
  connection: "connecting" as "connecting" | "connected" | "initialized" | "disconnected",
  serverDeploying: checkServerDeployingSession(),
  authReady: false,
  authSessionReady: false,
  hasEverInitialized: false,
  authBusy: false,
  authBusyStartedAt: 0,
  authRetrying: false,
  authRetryAttempt: 0,
  authRetryNextAt: 0,
  authConfigured: false,
  authUserLabel: "",
  authEmail: "",
  authError: "",
  authBusyTitle: "",
  authBusyDetail: "",
  profileSetupRequired: false,
  gold: 0,
  level: 0,
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  modBreakdown: {
    attack: [{ label: "Base", mult: 1 }],
    defense: [{ label: "Base", mult: 1 }],
    income: [{ label: "Base", mult: 1 }],
    vision: [{ label: "Base", mult: 1 }]
  } as Record<"attack" | "defense" | "income" | "vision", Array<{ label: string; mult: number }>>,
  expandedModKey: null as "attack" | "defense" | "income" | "vision" | null,
  incomePerMinute: 0,
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  storageCap: { ...EMPIRE_STORAGE_FLOOR },
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  economyBreakdown: undefined as EconomyBreakdown | undefined,
  upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, gold: 0 },
  upkeepLastTick: {
    food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    foodCoverage: 1
  },
  foodCoverageWarned: false,
  goldAnimUntil: 0,
  goldAnimDir: 0 as -1 | 0 | 1,
  defensibilityAnimUntil: 0,
  defensibilityAnimDir: 0 as -1 | 0 | 1,
  strategicAnim: {
    FOOD: { until: 0, dir: 0 as -1 | 0 | 1 },
    IRON: { until: 0, dir: 0 as -1 | 0 | 1 },
    CRYSTAL: { until: 0, dir: 0 as -1 | 0 | 1 },
    SUPPLY: { until: 0, dir: 0 as -1 | 0 | 1 },
    SHARD: { until: 0, dir: 0 as -1 | 0 | 1 }
  },
  stamina: 0,
  manpower: MANPOWER_BASE_CAP,
  manpowerCap: MANPOWER_BASE_CAP,
  manpowerRegenPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  logisticsThroughputPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  manpowerBreakdown: {
    cap: [{ label: "Base", amount: MANPOWER_BASE_CAP }],
    regen: [{ label: "Base", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
  } as { cap: Array<{ label: string; amount: number; note?: string }>; regen: Array<{ label: string; amount: number; note?: string }> },
  availableTechPicks: 0,
  developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
  activeDevelopmentProcessCount: 0,
  defensibilityPct: 100,
  territoryT: 1,
  exposureE: 4,
  settledT: 1,
  settledE: 4,
  selected: undefined as { x: number; y: number } | undefined,
  tileDetailRequestedAt: new Map<string, number>(),
  // tileKey -> ms timestamp when a full-detail TILE_DELTA arrived. Used to
  // skip REQUEST_TILE_DETAIL re-sends when we already have a recent answer.
  // Paired with tileDetailRequestedAt to dedupe in-flight requests as well.
  tileDetailReceivedAt: new Map<string, number>(),
  // tileKey -> ms timestamp when an owned settled town was first observed
  // missing owner-economy fields (Production/Support/Upkeep). Used to drive
  // per-row "loading for Xs" indicators on the tile detail panel until the
  // gateway responds with a refreshed tile-detail payload.
  tileTownPartialSince: new Map<string, number>(),
  hover: undefined as { x: number; y: number } | undefined,
  homeTile: undefined as { x: number; y: number } | undefined,
  localhostDevAetherWall: false,
  tiles: new Map<string, Tile>(),
  tilesRevision: 0,
  camX: 0,
  camY: 0,
  zoom: 22,
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  domainIds: [] as string[],
  // Locked sub-choice for Clockwork Stipend; undefined when not picked yet.
  chosenTrickleResource: undefined as ChosenTrickleResource | undefined,
  // Emperor-endorsement bonus (galaxy meta-layer Phase 1).
  imperialWardCharges: undefined as number | undefined,
  imperialWardActiveUntil: undefined as number | undefined,
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  currentResearch: undefined as PendingResearch | undefined,
  domainChoices: [] as string[],
  domainCatalog: [] as DomainInfo[],
  domainUiSelectedId: "" as string,
  revealCapacity: 1,
  activeRevealTargets: [] as string[],
  abilityCooldowns: {} as Partial<
    Record<
      | "aether_bridge"
      | "aether_wall"
      | "aether_lance"
      | "retort_recasting"
      | "siphon"
      | "reveal_empire"
      | "reveal_empire_stats"
      | "survey_sweep"
      | "create_mountain"
      | "remove_mountain"
      | "imperial_exchange_levy"
      | "world_engine_strike"
      | "stormfront"
      | "aegis_lock"
      | "aether_emp"
      | "city_overclock"
      | "astral_dock_launch",
      number
    >
  >,
  revealTargetId: "" as string,
  revealedEmpireStatsByPlayer: new Map<string, RevealEmpireStatsView>(),
  allies: [] as string[],
  activeAllianceBreaks: [] as ActiveAllianceBreakView[],
  recentAllianceBreaks: [] as RecentAllianceBreakView[],
  activeTruces: [] as ActiveTruceView[],
  playerNames: new Map<string, string>(),
  playerColors: new Map<string, string>(),
  suggestedColors: ["#38b000", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"] as string[],
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  playerShieldUntil: new Map<string, number>(),
  serverSupportedMessageTypes: new Set<string>(),
  incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
  incomingAllianceRequests: [] as AllianceRequest[],
  outgoingAllianceRequests: [] as AllianceRequest[],
  incomingTruceRequests: [] as TruceRequest[],
  outgoingTruceRequests: [] as TruceRequest[],
  notifiedIncomingDiplomacyRequestIds: new Set<string>(),
  notifiedDiplomacyIdsLoadedFor: "",
  activeAetherBridges: [] as ActiveAetherBridgeView[],
  activeAetherWalls: [] as ActiveAetherWallView[],
  aetherLanceFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  surveySweepFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  surveySweepPings: [] as SurveySweepPing[],
  siphonFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  retortRecastFxQueue: [] as Array<{ x: number; y: number; targetResource: "FARM" | "WOOD" | "IRON" | "GEMS"; queuedAt: number }>,
  revealEmpireFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  revealEmpireStatsFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  bombardFxQueue: [] as Array<{
    x: number;
    y: number;
    queuedAt: number;
    tiles: Array<{ dx: number; dy: number; outcome: "hit" | "miss" }>;
  }>,
  worldEngineStrikeFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  imperialExchangeLevyFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  aegisLockFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  astralDockLaunchFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  activeRevealEmpireStatsPopup: undefined as RevealEmpireStatsView | undefined,
  strategicReplayEvents: [] as StrategicReplayEvent[],
  replayActive: false,
  replayPlaying: false,
  replaySpeed: 8 as 2 | 8 | 30,
  replayIndex: 0,
  replayAppliedIndex: 0,
  replayLastTickAt: 0,
  replayOwnershipByTile: new Map<string, { ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" }>(),
  socialInspectPlayerId: "" as string,
  feed: [] as FeedEntry[],
  feedUnreadCount: 0,
  feedAttentionUntil: 0,
  persistentAlertLocators: [] as Array<{
    id: string;
    kind: "town_unfed" | "muster_active";
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    radius: number;
  }>,
  capture: undefined as { startAt: number; resolvesAt: number; target: { x: number; y: number }; silent?: boolean; fromMusterAdvance?: boolean } | undefined,
  musterTransit: undefined as {
    musterX: number;
    musterY: number;
    targetX: number;
    targetY: number;
    transitStartAt: number;
    transitEndsAt: number;
  } | undefined,
  activeMusterSource: undefined as { x: number; y: number } | undefined,
  deferredAttack: undefined as {
    fromX: number; fromY: number;
    toX: number; toY: number;
    commandId: string; clientSeq: number;
  } | undefined,
  pendingCombatReveal: undefined as
    | {
        targetKey: string;
        title: string;
        detail: string;
        tone: "success" | "warn";
        manpowerLoss?: number;
        revealed: boolean;
        result?: Record<string, unknown>;
      }
    | undefined,
  revealedPredictedCombatByKey: new Map<string, { title: string; detail: string }>(),
  settleProgressByTile: new Map<string, TileTimedProgress>(),
  latestSettleTargetKey: "",
  optimisticTileSnapshots: new Map<string, Tile | undefined>(),
  captureAlert: undefined as { title: string; detail: string; until: number; tone: "success" | "error" | "warn"; manpowerLoss?: number } | undefined,
  settlementRepairDiagnosticKey: "" as string,
  collectVisibleCooldownUntil: 0,
  pendingCollectVisibleKeys: new Set<string>(),
  pendingCollectVisibleDelta: {
    gold: 0,
    strategic: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>
  },
  pendingCollectTileDelta: new Map<
    string,
    {
      gold: number;
      strategic: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>;
      previousYield?: { gold: number; strategic: Record<string, number> };
    }
  >(),
  pendingShardCollect: undefined as { tileKey: string; shardSite: NonNullable<Tile["shardSite"]> } | undefined,
  leaderboard: {
    overall: [] as LeaderboardOverallEntry[],
    selfOverall: undefined as LeaderboardOverallEntry | undefined,
    selfByTiles: undefined as LeaderboardMetricEntry | undefined,
    selfByIncome: undefined as LeaderboardMetricEntry | undefined,
    selfByTechs: undefined as LeaderboardMetricEntry | undefined,
    byTiles: [] as LeaderboardMetricEntry[],
    byIncome: [] as LeaderboardMetricEntry[],
    byTechs: [] as LeaderboardMetricEntry[]
  },
  seasonVictory: [] as SeasonVictoryObjectiveView[],
  seasonWinner: undefined as SeasonWinnerView | undefined,
  // Season-end screen: shown once a winner is crowned (season ended). The player
  // can dismiss it with "Look Around"; reset to false on SEASON_ROLLOVER so the
  // screen shows again the next time a season ends.
  seasonEndDismissed: false,
  seasonEndStarting: false,
  missions: [] as MissionState[],
  mobilePanel: "core" as "core" | "tech" | "domains" | "social" | "economy" | "defensibility" | "leaderboard" | "feed" | "manpower" | "development" | "settings",
  activePanel: null as "tech" | "domains" | "alliance" | "economy" | "defensibility" | "leaderboard" | "feed" | "manpower" | "development" | "settings" | null,
  showWeakDefensibility: false,
  shardRainPingsByTile: new Map<string, { x: number; y: number; createdAt: number; activateAt: number }>(),
  shardRainFxUntil: 0,
  shardAlert: undefined as ClientShardRainAlert | undefined, shardRainStatus: undefined as ClientShardRainAlert | undefined, // shardRainStatus survives toast dismissal, unlike shardAlert
  respawnNotice: undefined as PlayerRespawnNotice | undefined,
  respawnOverlayOpen: false,
  lastSeenRespawnNoticeId: "",
  dismissedShardAlertKeys: new Set<string>(),
  structureInfoKey: "" as string,
  crystalAbilityInfoKey: "" as string,
  economyFocus: "ALL" as "ALL" | "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY",
  unreadAttackAlerts: 0,
  techSection: "research" as "research" | "domains",
  techTreeExpanded: false,
  techUiSelectedId: "" as string,
  techDetailOpen: false,
  domainDetailOpen: false,
  pendingTechUnlockId: "" as string,
  pendingDomainUnlockId: "" as string,
  techChoicesSig: "" as string,
  techTreeScrollLeft: 0,
  techTreeScrollTop: 0,
  techTreeZoom: 1,
  actionQueue: [] as Array<{ x: number; y: number; retries?: number; fromWaypoint?: boolean }>,
  pendingMusterAttacks: [] as Array<{ targetX: number; targetY: number; fromX: number; fromY: number; musterTileKey: string }>,
  waypoint: undefined as ClientWaypoint | undefined,
  frontierLateAckUntilByTarget: new Map<string, number>(),
  developmentQueue: [] as Array<
    | { kind: "SETTLE"; x: number; y: number; tileKey: string; label: string }
    | {
        kind: "BUILD";
        x: number;
        y: number;
        tileKey: string;
        label: string;
        payload: QueuedBuildPayload;
        optimisticKind: QueuedOptimisticKind;
      }
  >,
  autoSettlementQueue: [] as Array<{ x: number; y: number }>,
  skippedAutoSettlementTileKeys: new Set<string>(),
  autoSettlementQueueVisibleUntilByTile: new Map<string, number>(),
  lastDevelopmentAttempt: undefined as
    | { kind: "SETTLE"; x: number; y: number; tileKey: string; label: string }
    | {
        kind: "BUILD";
        x: number;
        y: number;
        tileKey: string;
        label: string;
        payload: QueuedBuildPayload;
        optimisticKind: QueuedOptimisticKind;
      }
    | undefined,
  queuedDevelopmentDispatchPending: false,
  queuedTargetKeys: new Set<string>(),
  nextCommandClientSeq: 1,
  actionInFlight: false,
  actionAcceptedAck: false,
  combatStartAck: false,
  actionAcceptTimeoutHandledAt: 0,
  actionStartedAt: 0,
  actionTargetKey: "",
  actionCurrent: undefined as
    | {
        x: number;
        y: number;
        retries: number;
        commandId?: string;
        clientSeq?: number;
        actionType?: "EXPAND" | "ATTACK";
      }
    | undefined,
  attackPreview: undefined as
    | {
        fromKey: string;
        toKey: string;
        valid: boolean;
        reason?: string;
        winChance?: number;
        manpowerMin?: number;
        atkEff?: number;
        defEff?: number;
        defenseEffPct?: number;
        receivedAt: number;
      }
    | undefined,
  attackPreviewCacheByKey: new Map<
    string,
    {
      fromKey: string;
      toKey: string;
      valid: boolean;
      reason?: string;
      winChance?: number;
      manpowerMin?: number;
      atkEff?: number;
      defEff?: number;
      defenseEffPct?: number;
      receivedAt: number;
    }
  >(),
  attackPreviewPendingKey: "",
  attackPreviewPendingRequestId: "",
  attackPreviewPendingStartedAt: 0,
  attackPreviewRequestSeq: 0,
  attackPreviewLatestRequestIdByKey: new Map<string, string>(),
  lastAttackPreviewAt: 0,
  dragPreviewKeys: new Set<string>(),
  boxSelectStart: undefined as { gx: number; gy: number } | undefined,
  boxSelectCurrent: undefined as { gx: number; gy: number } | undefined,
  fogDisabled: false,
  // Bounded ring buffer of recently-received WS messages keyed for the
  // "Download debug log" button on the town overview pane. Captures the
  // last MAX_RECENT_TILE_MESSAGES tile-touching messages so a stuck
  // spinner can be diagnosed offline.
  recentTileMessages: [] as Array<{
    ts: number;
    type: string;
    x?: number;
    y?: number;
    tileCount?: number;
    raw?: unknown;
  }>,
  mapRevealEligible: false,
  mapRevealEnabled: false,
  lastSubCx: Number.NaN,
  lastSubCy: Number.NaN,
  lastSubRadius: Number.NaN,
  lastSubAt: 0,
  lastChunkSnapshotGeneration: 0,
  dockPairs: [] as DockPair[],
  dockRouteCache: new Map<string, Array<{ x: number; y: number }>>(),
  discoveredDockTiles: new Set<string>(),
  discoveredTiles: new Set<string>(),
  autoSettleTargets: new Set<string>(),
  frontierSyncWaitUntilByTarget: new Map<string, number>(),
  hasOwnedTileInCache: false,
  tileActionMenu: {
    visible: false,
    x: 0,
    y: 0,
    mode: "single" as "single" | "bulk",
    bulkKeys: [] as string[],
    currentTileKey: "",
    activeTab: "overview" as TileMenuTab,
    scrollTopByTab: {} as Partial<Record<TileMenuTab, number>>,
    renderSignature: ""
  },
  crystalTargeting: {
    active: false,
    ability: "aether_bridge" as CrystalTargetingAbility,
    validTargets: new Set<string>(),
    originByTarget: new Map<string, string>()
  },
  aetherWallTargeting: {
    active: false,
    validOrigins: new Set<string>(),
    direction: "N" as "N" | "E" | "S" | "W",
    length: 1 as 1 | 2 | 3
  },
  airportTargeting: {
    active: false,
    originKey: "",
    validTargets: new Set<string>()
  },
  guide: {
    open: storageGet(GUIDE_STORAGE_KEY) !== "1",
    stepIndex: 0,
    completed: storageGet(GUIDE_STORAGE_KEY) === "1",
    autoOpened: storageGet(GUIDE_AUTO_OPEN_STORAGE_KEY) === "1"
  },
  changelog: {
    open: false,
    seenVersion: storageGet(CLIENT_CHANGELOG_STORAGE_KEY) ?? "",
    scrollTop: 0
  },
  rendererPrompt: {
    dismissed: storageGet(RENDERER_PROMPT_STORAGE_KEY) === "1"
  },
  activeBackend: "legacy" as "legacy" | "gateway",
  bridgeDebugMode: "unknown" as "unknown" | "legacy-server" | "rewrite-gateway",
  bridgeDebugBootstrap: "pending" as "pending" | "legacy-init" | "rewrite-init",
  bridgeDebugWsUrl: "",
  bridgeDebugSeasonId: "",
  bridgeDebugRuntimeFingerprint: "",
  bridgeDebugSnapshotLabel: "",
  // Set from INIT.serverBuildSha. Empty string means the gateway was started
  // without BUILD_SHA in its environment (local dev, ad-hoc machine start
  // without a deploy) — the HUD renders that as "dev".
  bridgeDebugServerBuildSha: "",
  bridgeDebugInitialTileCount: 0,
  bridgeDebugSupportedMessageCount: 0,
  bridgeDebugAcceptLatencyP95Ms: 0,
  mapLoadStartedAt: Date.now(),
  firstChunkAt: 0,
  chunkFullCount: 0
});
export type ClientState = ReturnType<typeof createInitialState>;

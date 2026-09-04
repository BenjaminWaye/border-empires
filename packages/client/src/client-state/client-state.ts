import { CLIENT_CHANGELOG_STORAGE_KEY } from "../client-changelog/client-changelog.js";
import { createInitialUpkeepLastTick } from "./client-state-upkeep-defaults.js";
import { createInitialSpaceViewState } from "./client-space-view-state-defaults.js";
import { createInitialShardRainState } from "./client-state-shard-rain-defaults.js";
import { createBridgeDebugInitialState } from "./client-state-bridge-debug.js";
import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY, RENDERER_PROMPT_STORAGE_KEY } from "../client-constants.js";
import { cameraLocationInitialState, readUrlTileFocus } from "./client-camera-storage.js";
import { createInitialReachState } from "./client-reach-state-defaults.js";
import { checkServerDeployingSession } from "../client-server-deploying-session/client-server-deploying-session.js";
import { DEVELOPMENT_PROCESS_LIMIT, EMPIRE_STORAGE_FLOOR, MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE, type BuildableStructureType, type ChosenTrickleResource, type FrontierCombatSideBreakdown, type SlotResource } from "@border-empires/shared";
import type { EconomyBreakdown } from "../client-economy-model.js";
import type { VictoryHoldAlert } from "../client-victory-alert/client-victory-alert.js";
import type { DeferredMusterAttack, MusterTransitEntry } from "../client-muster-transit/client-muster-transit.js";
import type { ActiveBattleOverlay } from "../client-battle-overlay/client-battle-overlay.js";
import type { WorldEngineStrikeHistoryRecord } from "../client-world-engine-strike-history/client-world-engine-strike-history.js";
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
  SeasonStatsView,
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

export type { ClientWaypoint } from "./client-waypoint-state.js";
import type { ClientWaypoint } from "./client-waypoint-state.js";

type QueuedOptimisticKind = OptimisticStructureKind;
type QueuedBuildPayload = { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: string } | { type: "REMOVE_STRUCTURE"; x: number; y: number };

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

export const storageRemove = (keyName: string): void => {
  try {
    window.localStorage.removeItem(keyName);
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
  // When the current outage started: 0 until the first socket teardown, then
  // re-anchored on each teardown of a healthy session (see
  // handleSocketTornDown). Lets the HUD tell "just dropped, probably a
  // backgrounded tab" apart from "down long enough to be worth interrupting
  // for", so a brief reconnect never flashes the full loading overlay — see
  // RECONNECT_OVERLAY_GRACE_MS in client-constants.ts. Deliberately NOT
  // cleared on INIT: the grace window has to cover the post-INIT resync too,
  // since INIT resets firstChunkAt to 0. A stale value once the map is back
  // is harmless — isMapLoadingOverlayActive ignores it entirely while the
  // session is initialized with chunks in hand.
  disconnectedSince: 0,
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
  seasonFull: false, seasonFullNotifyAcknowledged: false, // SEASON_FULL rejection — see client-auth-ui.ts
  profileSetupRequired: false,
  gold: 0, level: 0,
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  modBreakdown: {
    attack: [{ label: "Base", mult: 1 }],
    defense: [{ label: "Base", mult: 1 }],
    income: [{ label: "Base", mult: 1 }],
    vision: [{ label: "Base", mult: 1 }]
  } as Record<"attack" | "defense" | "income" | "vision", Array<{ label: string; mult: number }>>,
  expandedModKey: null as "attack" | "defense" | "income" | "vision" | null,
  incomePerMinute: 0,
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } as Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>,
  storageCap: { ...EMPIRE_STORAGE_FLOOR },
  strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } as Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>,
  // §5 (resource slots, docs/manpower-economy-rewrite-plan.md): global
  // per-resource supply/demand pool, mirroring what hasFreeResourceSlots
  // gates BUILD_STRUCTURE on server-side (§14.3) -- the real affordability
  // signal for FOOD/TITANIUM/CRYSTAL/UMBRITE now that stockpiles are retired at
  // build time (Step 5 item 4 Slice A).
  resourceSlots: {
    supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } as Record<SlotResource, number>, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } as Record<SlotResource, number>
  },
  // §14.2: per-structure dormancy detail, keyed by "x,y:field" — which structures are dormant right now, and which resource(s) they're short
  // on. Feeds the greyed-out/"unpowered" indicator in the tile detail view.
  dormantStructures: [] as Array<{ key: string; resources: SlotResource[] }>,
  eventLog: [] as Array<{ id: string; type: string; text: string; occurredAt: number; x?: number; y?: number }>, // §20: durable event log, most-recent-last
  eventLogFeedSeenIds: undefined as Set<string> | undefined, // ids already echoed into the Activity Feed; undefined until first sync (avoids backfilling history as new)
  economyBreakdown: undefined as EconomyBreakdown | undefined,
  upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
  upkeepLastTick: createInitialUpkeepLastTick(),
  foodCoverageWarned: false,
  goldAnimUntil: 0, goldAnimDir: 0 as -1 | 0 | 1,
  defensibilityAnimUntil: 0,
  defensibilityAnimDir: 0 as -1 | 0 | 1,
  strategicAnim: {
    FOOD: { until: 0, dir: 0 as -1 | 0 | 1 },
    TITANIUM: { until: 0, dir: 0 as -1 | 0 | 1 },
    CRYSTAL: { until: 0, dir: 0 as -1 | 0 | 1 },
    UMBRITE: { until: 0, dir: 0 as -1 | 0 | 1 },
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
  integrityWarningDismissed: false,
  settledT: 1,
  settledE: 4,
  // Opens straight on a deep-linked tile (e.g. an attack alert email's "Go to tile" link — see readUrlTileFocus() in client-camera-storage.ts).
  selected: readUrlTileFocus() ?? undefined as { x: number; y: number } | undefined,
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
  tilesRevision: 0, tilesRevisionChangedKeys: new Set<string>(), tilesRevisionOverflowed: false, // see recordTileRevisionChange
  ...cameraLocationInitialState(),
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  domainIds: [] as string[],
  // Locked sub-choice for Clockwork Stipend; undefined when not picked yet.
  chosenTrickleResource: undefined as ChosenTrickleResource | undefined,
  // Emperor-endorsement bonus (galaxy meta-layer Phase 1).
  imperialWardCharges: undefined as number | undefined, imperialWardActiveUntil: undefined as number | undefined,
  wonderLastFreeRushBuyAt: undefined as number | undefined, // Quickforge: ms of last discounted rush-buy (0/undefined = unused) -- rush-buy price preview only, server is price-authoritative
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  techAffordableByTechId: new Map<string, boolean>(), techAffordablePulseUntilByTechId: new Map<string, number>(), // §7.3 "reward is ready" pulse tracking
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
  incomingAttacksByTile: new Map<
    string,
    { attackerName: string; resolvesAt: number; attackerId?: string; fromX?: number; fromY?: number; transitEndsAt?: number }
  >(),
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
  retortRecastFxQueue: [] as Array<{ x: number; y: number; targetResource: "FARM" | "UMBRITE" | "TITANIUM" | "GEMS"; queuedAt: number }>,
  revealEmpireFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  revealEmpireStatsFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  bombardFxQueue: [] as Array<{ x: number; y: number; queuedAt: number; tiles: Array<{ dx: number; dy: number; outcome: "hit" | "miss" }> }>,
  worldEngineStrikeFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  // Drives the global camera-shake trigger (client-map-3d-camera-shake-fx.ts) —
  // pushed once per newly-seen WORLD_ENGINE_STRIKE_ANNOUNCEMENT broadcast, for
  // every connected client (not just the caster/target), never replayed from
  // 12h history so it only ever fires live, once, at the moment of the strike.
  worldEngineStrikeShakeQueue: [] as Array<{ strikeId: string; queuedAt: number }>,
  // strikeId dedup set shared by the live broadcast handler and the 12h
  // history backfill, so a strike already seen live isn't replayed as a
  // toast/popup/shake when history is fetched on reconnect.
  worldEngineStrikeSeenIds: new Set<string>(),
  // Most-recent-first, capped list backing the Activity Feed's world-events
  // history section — populated both live and from the 12h history fetch.
  worldEngineStrikeAnnouncements: [] as WorldEngineStrikeHistoryRecord[],
  imperialExchangeLevyFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  aegisLockFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  astralDockLaunchFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>,
  unsettleFxQueue: [] as Array<{ x: number; y: number; queuedAt: number }>, // "unsettle" transition (SETTLED -> FRONTIER, same owner); see client-map-3d-unsettle-fx.ts
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
  feed: [] as FeedEntry[], onboardingHighlightTiles: [] as Array<{ x: number; y: number }>,
  feedUnreadCount: 0,
  spawnFeedShownSeasonId: "" as string,
  feedAttentionUntil: 0,
  persistentAlertLocators: [] as Array<{
    id: string;
    kind: "town_unfed" | "muster_active" | "waypoint_manpower_paused" | "shard_rain";
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    radius: number;
  }>,
  capture: undefined as { startAt: number; resolvesAt: number; target: { x: number; y: number }; origin?: { x: number; y: number }; actionType?: "EXPAND" | "ATTACK"; silent?: boolean; fromMusterAdvance?: boolean } | undefined, // origin/actionType feed the attacker-side battle overlay; see client-siege-tracking.ts
  // Set to the startAt of the capture the player dismissed via the
  // capture-overlay's "Dismiss" button, so the big progress banner stays
  // hidden for that specific claim without cancelling it. Compared against
  // state.capture.startAt so a brand-new claim (different startAt) always
  // reopens the banner even on the same tile. See client-capture-effects.ts.
  dismissedCaptureStartAt: undefined as number | undefined,
  // Server-resolved battle overlays keyed by target tile key. Populated from
  // the combat-broadcast payload riding TILE_DELTA_BATCH deltas (see
  // client-battle-overlay.ts) and consumed by client-map-3d-battle-overlay-fx.ts.
  // Independent of `capture` above (which only ever tracks this client's own
  // in-flight action for the HUD) so any number of battles — including ones
  // this player isn't a party to — can animate concurrently.
  activeBattles: new Map<string, ActiveBattleOverlay>(),
  // Keyed by target tile key: when this client first rendered a pre-
  // resolution skirmish there (performance.now()-scale), NOT the siege's
  // actual server-side start time — see client-map-3d-capture-overlays.ts
  // (writer) and client-battle-overlay.ts (reader, so a resolved battle can
  // continue the skirmish's own in-progress approach instead of restarting
  // or snapping straight to the clash oscillation).
  skirmishSeenAt: new Map<string, number>(),
  // Keyed by target tile key: a muster flag's ADVANCE-mode auto-fire attack in
  // flight (never occupies `capture`, a single slot for this client's own manually-dispatched action; see client-siege-tracking.ts). transitEndsAt/musterOriginX/Y: its mechanical travel-time delay, when the server sent it.
  outgoingMusterAttacksByTile: new Map<string, { originX: number; originY: number; targetX: number; targetY: number; resolvesAt: number; transitEndsAt?: number; musterOriginX?: number; musterOriginY?: number }>(),
  // Keyed by the muster flag's own tile key (`${x},${y}`) so independent
  // flags can arm, march, and fire concurrently. See client-muster-transit.ts.
  musterTransitByTile: new Map<string, MusterTransitEntry>(),
  deferredAttackByTile: new Map<string, DeferredMusterAttack>(),
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
  pendingCollectTileDelta: new Map<
    string,
    {
      gold: number;
      strategic: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
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
  // can dismiss it with "Look Around"; reset on SEASON_ROLLOVER.
  seasonEndDismissed: false,
  seasonEndStarting: false,
  seasonStats: undefined as SeasonStatsView | undefined,
  seasonStartVoteCount: 0, seasonStartVoted: false,
  missions: [] as MissionState[],
  mobilePanel: "core" as "core" | "tech" | "domains" | "social" | "economy" | "defensibility" | "leaderboard" | "feed" | "manpower" | "development" | "settings",
  activePanel: null as "tech" | "domains" | "alliance" | "economy" | "defensibility" | "leaderboard" | "feed" | "manpower" | "development" | "settings" | null,
  ...createInitialSpaceViewState(),
  showWeakDefensibility: false,
  ...createInitialReachState(),
  ...createInitialShardRainState(),
  victoryHoldAlert: undefined as VictoryHoldAlert | undefined, victoryHoldAlertCollapsed: false, acknowledgedVictoryHoldAlertKeys: new Set<string>(), // never fully hides while a hold is active — see client-victory-alert.ts
  respawnNotice: undefined as PlayerRespawnNotice | undefined,
  respawnOverlayOpen: false,
  needsSeasonJoin: false, joinSeasonOverlayOpen: false, joinSeasonId: "" as string, joinSeasonPending: false, seasonPending: false, seasonPendingScheduledStartAt: 0, seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 0, seasonLobbyRoster: [] as { playerId: string; name: string }[], // join-season overlay + SEASON_PENDING countdown + lobby roster: see client-join-season-overlay.ts / client-season-lobby-panel.ts
  lastSeenRespawnNoticeId: "",
  dismissedShardAlertKeys: new Set<string>(),
  structureInfoKey: "" as string, crystalAbilityInfoKey: "" as string,
  economyFocus: "ALL" as "ALL" | "GOLD" | "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE",
  unreadAttackAlerts: 0,
  techSection: "research" as "research" | "domains",
  techTreeExpanded: false,
  techUiSelectedId: "" as string,
  techDetailOpen: false,
  domainDetailOpen: false,
  settingsSubPage: null as "account" | "gameplay" | "diagnostics" | null,
  pendingTechUnlockId: "" as string,
  pendingDomainUnlockId: "" as string,
  pendingDisplayNameChange: "" as string,
  pendingColorChange: "" as string,
  techChoicesSig: "" as string,
  techTreeScrollLeft: 0,
  techTreeScrollTop: 0,
  techTreeZoom: 1,
  actionQueue: [] as Array<{ x: number; y: number; retries?: number; fromWaypoint?: boolean }>,
  pendingMusterAttacks: [] as Array<{
    targetX: number;
    targetY: number;
    fromX: number;
    fromY: number;
    musterTileKey: string;
    dismissed?: boolean;
    musterRequestedAt?: number;
    // When this entry was first parked. dropStuckPendingMusterAttack's own
    // timeout only fires when a brand-new flag was just requested
    // (musterRequestedAt set) — an entry parked against an already-existing
    // flag has no such field and, if that flag later disappears (cleared,
    // captured away, or otherwise lost) or amount/required simply never
    // converge, previously had no expiry at all and could sit forever with
    // no feedback. This backstops that gap in processPendingMusterAttacks.
    queuedAt?: number;
  }>,
  waypoint: [] as ClientWaypoint[],
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
        attacker?: FrontierCombatSideBreakdown;
        defender?: FrontierCombatSideBreakdown;
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
      attacker?: FrontierCombatSideBreakdown;
      defender?: FrontierCombatSideBreakdown;
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
    // Set false only for CHUNK_FULL/CHUNK_BATCH messages the client received
    // but discarded (stale chunk generation) rather than applying to
    // state.tiles — omitted (implicitly applied) for every other message
    // type, which don't go through that generation check.
    applied?: boolean;
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
  discoveryTipQueue: [] as import("../client-discovery-tips/client-discovery-tips.js").DiscoveryTipId[], // see client-discovery-tips.ts
  autoSettleTargets: new Set<string>(),
  autoBuildTargets: new Map<string, BuildableStructureType>(),
  frontierSyncWaitUntilByTarget: new Map<string, number>(),
  // How many times processActionQueue has deferred a target while waiting for
  // its confirmed (non-optimistic) origin to resolve. Separate from the
  // per-entry `retries` field (which tracks failed dispatch attempts) so a
  // bounded cap can fall back to the optimistic origin without perturbing
  // dispatch-retry bookkeeping. Cleared whenever the target is dispatched or
  // dropped from the queue.
  confirmedOriginWaitAttemptsByTarget: new Map<string, number>(),
  // Last two observed (amount, updatedAt) samples per muster tile key, used to
  // linearly extrapolate the displayed muster progress between the sparse
  // server-pushed tile deltas (muster ticks server-side every 30s) instead of
  // holding flat then jumping. Re-anchored on every real delta.
  musterAmountRateByTile: new Map<string, { amount: number; at: number; ratePerMs: number }>(),
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
  buildingPlacement: {
    active: false,
    structureType: "" as "WATERWORKS" | "FOUNDRY" | "",
    x: 0,
    y: 0
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
  airportTargeting: { active: false, originKey: "", validTargets: new Set<string>() },
  musterMarchTargeting: { active: false, originX: 0, originY: 0 },
  warMusicHoldUntil: 0, // ms-until war music holds past the last combat signal — see client-war-music-signal.ts
  guide: {
    open: storageGet(GUIDE_STORAGE_KEY) !== "1",
    stepIndex: 0,
    completed: storageGet(GUIDE_STORAGE_KEY) === "1",
    autoOpened: storageGet(GUIDE_AUTO_OPEN_STORAGE_KEY) === "1"
  },
  changelog: {
    open: false,
    seenAt: Number(storageGet(CLIENT_CHANGELOG_STORAGE_KEY)) || 0,
    scrollTop: 0
  },
  rendererPrompt: {
    dismissed: storageGet(RENDERER_PROMPT_STORAGE_KEY) === "1"
  },
  ...createBridgeDebugInitialState(),
  mapLoadStartedAt: Date.now(),
  firstChunkAt: 0,
  chunkFullCount: 0
});
export type ClientState = ReturnType<typeof createInitialState>;

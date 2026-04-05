import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY } from "./client-constants.js";
import { MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE } from "@border-empires/shared";
import type { ClientShardRainAlert } from "./client-shard-alert.js";
import type {
  AllianceRequest,
  ActiveAetherBridgeView,
  StrategicReplayEvent,
  ActiveTruceView,
  CrystalTargetingAbility,
  DockPair,
  DomainInfo,
  EmpireVisualStyle,
  FeedEntry,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  PendingResearch,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  TechInfo,
  Tile,
  TruceRequest,
  TileActionDef,
  TileMenuTab,
  TileTimedProgress
} from "./client-types.js";

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
  authReady: false,
  authSessionReady: false,
  hasEverInitialized: false,
  authBusy: false,
  authRetrying: false,
  authConfigured: false,
  authUserLabel: "",
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
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>,
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>,
  upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 },
  upkeepLastTick: {
    food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
    oil: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
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
    SHARD: { until: 0, dir: 0 as -1 | 0 | 1 },
    OIL: { until: 0, dir: 0 as -1 | 0 | 1 }
  },
  stamina: 0,
  manpower: MANPOWER_BASE_CAP,
  manpowerCap: MANPOWER_BASE_CAP,
  manpowerRegenPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  manpowerBreakdown: {
    cap: [{ label: "Base", amount: MANPOWER_BASE_CAP }],
    regen: [{ label: "Base", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
  } as { cap: Array<{ label: string; amount: number; note?: string }>; regen: Array<{ label: string; amount: number; note?: string }> },
  availableTechPicks: 0,
  defensibilityPct: 100,
  territoryT: 1,
  exposureE: 4,
  settledT: 1,
  settledE: 4,
  selected: undefined as { x: number; y: number } | undefined,
  tileDetailRequestedAt: new Map<string, number>(),
  hover: undefined as { x: number; y: number } | undefined,
  homeTile: undefined as { x: number; y: number } | undefined,
  tiles: new Map<string, Tile>(),
  camX: 0,
  camY: 0,
  zoom: 22,
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  domainIds: [] as string[],
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  currentResearch: undefined as PendingResearch | undefined,
  domainChoices: [] as string[],
  domainCatalog: [] as DomainInfo[],
  domainUiSelectedId: "" as string,
  revealCapacity: 1,
  activeRevealTargets: [] as string[],
  abilityCooldowns: {} as Partial<Record<"aether_bridge" | "siphon" | "reveal_empire" | "create_mountain" | "remove_mountain", number>>,
  revealTargetId: "" as string,
  allies: [] as string[],
  activeTruces: [] as ActiveTruceView[],
  playerNames: new Map<string, string>(),
  playerColors: new Map<string, string>(),
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  playerShieldUntil: new Map<string, number>(),
  incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
  incomingAllianceRequests: [] as AllianceRequest[],
  outgoingAllianceRequests: [] as AllianceRequest[],
  incomingTruceRequests: [] as TruceRequest[],
  activeAetherBridges: [] as ActiveAetherBridgeView[],
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
  capture: undefined as { startAt: number; resolvesAt: number; target: { x: number; y: number } } | undefined,
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
  collectVisibleCooldownUntil: 0,
  pendingCollectVisibleKeys: new Set<string>(),
  pendingCollectVisibleDelta: {
    gold: 0,
    strategic: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>
  },
  pendingCollectTileDelta: new Map<
    string,
    {
      gold: number;
      strategic: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
      previousYield?: { gold: number; strategic: Record<string, number> };
    }
  >(),
  leaderboard: {
    overall: [] as LeaderboardOverallEntry[],
    selfOverall: undefined as LeaderboardOverallEntry | undefined,
    byTiles: [] as LeaderboardMetricEntry[],
    byIncome: [] as LeaderboardMetricEntry[],
    byTechs: [] as LeaderboardMetricEntry[]
  },
  seasonVictory: [] as SeasonVictoryObjectiveView[],
  seasonWinner: undefined as SeasonWinnerView | undefined,
  missions: [] as MissionState[],
  mobilePanel: "core" as "core" | "missions" | "tech" | "domains" | "social" | "economy" | "defensibility" | "intel" | "manpower",
  activePanel: null as "missions" | "tech" | "domains" | "alliance" | "economy" | "defensibility" | "leaderboard" | "feed" | "manpower" | null,
  showWeakDefensibility: false,
  shardRainFxUntil: 0,
  shardAlert: undefined as ClientShardRainAlert | undefined,
  dismissedShardAlertKeys: new Set<string>(),
  structureInfoKey: "" as string,
  crystalAbilityInfoKey: "" as string,
  economyFocus: "ALL" as "ALL" | "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD",
  unreadAttackAlerts: 0,
  techSection: "research" as "research" | "domains",
  techTreeExpanded: false,
  techUiSelectedId: "" as string,
  techDetailOpen: false,
  domainDetailOpen: false,
  pendingTechUnlockId: "" as string,
  techChoicesSig: "" as string,
  techTreeScrollLeft: 0,
  techTreeScrollTop: 0,
  actionQueue: [] as Array<{ x: number; y: number; mode?: "normal" | "breakthrough"; retries?: number }>,
  developmentQueue: [] as Array<
    | { kind: "SETTLE"; x: number; y: number; tileKey: string; label: string }
    | {
        kind: "BUILD";
        x: number;
        y: number;
        tileKey: string;
        label: string;
        payload:
          | { type: "BUILD_FORT"; x: number; y: number }
          | { type: "BUILD_OBSERVATORY"; x: number; y: number }
          | { type: "BUILD_SIEGE_OUTPOST"; x: number; y: number }
          | {
              type: "BUILD_ECONOMIC_STRUCTURE";
              x: number;
              y: number;
              structureType:
                | "FARMSTEAD"
                | "CAMP"
                | "MINE"
                | "MARKET"
                | "GRANARY"
                | "BANK"
                | "AIRPORT"
                | "WOODEN_FORT"
                | "LIGHT_OUTPOST"
                | "FUR_SYNTHESIZER"
                | "ADVANCED_FUR_SYNTHESIZER"
                | "IRONWORKS"
                | "ADVANCED_IRONWORKS"
                | "CRYSTAL_SYNTHESIZER"
                | "ADVANCED_CRYSTAL_SYNTHESIZER"
                | "FUEL_PLANT"
                | "CARAVANARY"
                | "FOUNDRY"
                | "GARRISON_HALL"
                | "CUSTOMS_HOUSE"
                | "GOVERNORS_OFFICE"
                | "RADAR_SYSTEM";
            };
        optimisticKind:
          | "FORT"
          | "OBSERVATORY"
          | "SIEGE_OUTPOST"
          | "FARMSTEAD"
          | "CAMP"
          | "MINE"
          | "MARKET"
          | "GRANARY"
          | "BANK"
          | "AIRPORT"
          | "WOODEN_FORT"
          | "LIGHT_OUTPOST"
          | "FUR_SYNTHESIZER"
          | "ADVANCED_FUR_SYNTHESIZER"
          | "IRONWORKS"
          | "ADVANCED_IRONWORKS"
          | "CRYSTAL_SYNTHESIZER"
          | "ADVANCED_CRYSTAL_SYNTHESIZER"
          | "FUEL_PLANT"
          | "CARAVANARY"
          | "FOUNDRY"
          | "GARRISON_HALL"
          | "CUSTOMS_HOUSE"
          | "GOVERNORS_OFFICE"
          | "RADAR_SYSTEM";
      }
  >,
  queuedTargetKeys: new Set<string>(),
  actionInFlight: false,
  combatStartAck: false,
  actionStartedAt: 0,
  actionTargetKey: "",
  actionCurrent: undefined as { x: number; y: number; mode?: "normal" | "breakthrough"; retries: number } | undefined,
  attackPreview: undefined as
    | {
        fromKey: string;
        toKey: string;
        valid: boolean;
        reason?: string;
        winChance?: number;
        breakthroughWinChance?: number;
        manpowerMin?: number;
        breakthroughManpowerMin?: number;
        atkEff?: number;
        defEff?: number;
        defenseEffPct?: number;
      }
    | undefined,
  attackPreviewPendingKey: "",
  lastAttackPreviewAt: 0,
  dragPreviewKeys: new Set<string>(),
  boxSelectStart: undefined as { gx: number; gy: number } | undefined,
  boxSelectCurrent: undefined as { gx: number; gy: number } | undefined,
  fogDisabled: false,
  lastSubCx: Number.NaN,
  lastSubCy: Number.NaN,
  lastSubRadius: Number.NaN,
  lastSubAt: 0,
  dockPairs: [] as DockPair[],
  dockRouteCache: new Map<string, Array<{ x: number; y: number }>>(),
  discoveredDockTiles: new Set<string>(),
  discoveredTiles: new Set<string>(),
  autoSettleTargets: new Set<string>(),
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
  mapLoadStartedAt: Date.now(),
  firstChunkAt: 0,
  chunkFullCount: 0
});

export type ClientState = ReturnType<typeof createInitialState>;

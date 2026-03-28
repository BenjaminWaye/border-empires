import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY } from "./client-constants.js";
import type {
  AllianceRequest,
  CrystalTargetingAbility,
  DockPair,
  DomainInfo,
  EmpireVisualStyle,
  FeedEntry,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  TechInfo,
  Tile,
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
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } as Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, gold: 0 },
  upkeepLastTick: {
    food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0 },
    foodCoverage: 1
  },
  foodCoverageWarned: false,
  goldAnimUntil: 0,
  goldAnimDir: 0 as -1 | 0 | 1,
  strategicAnim: {
    FOOD: { until: 0, dir: 0 as -1 | 0 | 1 },
    IRON: { until: 0, dir: 0 as -1 | 0 | 1 },
    CRYSTAL: { until: 0, dir: 0 as -1 | 0 | 1 },
    SUPPLY: { until: 0, dir: 0 as -1 | 0 | 1 },
    SHARD: { until: 0, dir: 0 as -1 | 0 | 1 }
  },
  stamina: 0,
  availableTechPicks: 0,
  defensibilityPct: 100,
  territoryT: 1,
  exposureE: 4,
  settledT: 1,
  settledE: 4,
  selected: undefined as { x: number; y: number } | undefined,
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
  domainChoices: [] as string[],
  domainCatalog: [] as DomainInfo[],
  domainUiSelectedId: "" as string,
  revealCapacity: 1,
  activeRevealTargets: [] as string[],
  abilityCooldowns: {} as Partial<Record<"deep_strike" | "naval_infiltration" | "sabotage" | "reveal_empire" | "create_mountain" | "remove_mountain", number>>,
  revealTargetId: "" as string,
  allies: [] as string[],
  playerNames: new Map<string, string>(),
  playerColors: new Map<string, string>(),
  playerVisualStyles: new Map<string, EmpireVisualStyle>(),
  incomingAllianceRequests: [] as AllianceRequest[],
  feed: [] as FeedEntry[],
  capture: undefined as { startAt: number; resolvesAt: number; target: { x: number; y: number } } | undefined,
  settleProgressByTile: new Map<string, TileTimedProgress>(),
  latestSettleTargetKey: "",
  optimisticTileSnapshots: new Map<string, Tile | undefined>(),
  captureAlert: undefined as { title: string; detail: string; until: number; tone: "error" | "warn" } | undefined,
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
  leaderboard: {
    overall: [] as LeaderboardOverallEntry[],
    byTiles: [] as LeaderboardMetricEntry[],
    byIncome: [] as LeaderboardMetricEntry[],
    byTechs: [] as LeaderboardMetricEntry[]
  },
  seasonVictory: [] as SeasonVictoryObjectiveView[],
  seasonWinner: undefined as SeasonWinnerView | undefined,
  missions: [] as MissionState[],
  mobilePanel: "core" as "core" | "missions" | "tech" | "social" | "economy" | "defensibility" | "intel",
  activePanel: null as "missions" | "tech" | "alliance" | "economy" | "defensibility" | "leaderboard" | "feed" | "settings" | null,
  economyFocus: "ALL" as "ALL" | "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD",
  unreadAttackAlerts: 0,
  techSection: "research" as "research" | "domains",
  techUiSelectedId: "" as string,
  pendingTechUnlockId: "" as string,
  techChoicesSig: "" as string,
  actionQueue: [] as Array<{ x: number; y: number; mode?: "normal" | "breakthrough"; retries?: number }>,
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
  fogDisabled: true,
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
    activeTab: "overview" as TileMenuTab
  },
  crystalTargeting: {
    active: false,
    ability: "deep_strike" as CrystalTargetingAbility,
    validTargets: new Set<string>(),
    originByTarget: new Map<string, string>()
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

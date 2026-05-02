import { describe, expect, it, vi } from "vitest";

import type { Player } from "@border-empires/shared";

import { createServerPlayerUpdateRuntime } from "./server-player-update-runtime.js";

const buildPlayer = (id: string): Player =>
  ({
    id,
    name: id,
    color: "#fff",
    level: 1,
    points: 10,
    gold: 10,
    stamina: 0,
    manpower: 0,
    manpowerCap: 0,
    manpowerRegenPerMinute: 0,
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    territoryTiles: new Set(),
    allies: new Set<string>(),
    missionStats: { neutralCaptures: 0, enemyCaptures: 0, combatWins: 0 },
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    revealTargets: new Set<string>(),
    availableTechPicks: 0,
    activity: [],
    isAi: false,
    spawnShieldUntil: 0,
    lastActiveAt: 0,
    T: 1,
    E: 0,
    Ts: 1,
    Es: 0,
    profileComplete: true
  }) as unknown as Player;

const createRuntimeHarness = (diagnosticRef: { current: { key: string; detail: string } | undefined }) => {
  const socket = { send: vi.fn() };
  const runtime = createServerPlayerUpdateRuntime({
    HOT_PLAYER_UPDATE_WARN_MS: 999,
    now: () => 0,
    applyManpowerRegen: vi.fn(),
    bulkSocketForPlayer: vi.fn(() => socket as never),
    getOrInitStrategicStocks: vi.fn(() => ({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 })),
    techPayloadSnapshotForPlayer: vi.fn(() => ({ techChoices: [], techCatalog: [] })),
    refreshGlobalStatusCache: vi.fn(),
    pendingSettlementsForPlayer: vi.fn(() => []),
    settlementRepairDiagnosticForPlayer: vi.fn(() => diagnosticRef.current),
    parseKey: vi.fn((_: string): [number, number] => [0, 0]),
    developmentProcessCapacityForPlayer: vi.fn(() => 0),
    activeDevelopmentProcessCountForPlayer: vi.fn(() => 0),
    logTileSync: vi.fn(),
    developmentProcessDebugBreakdownForPlayer: vi.fn(() => ({})),
    playerManpowerCap: vi.fn(() => 0),
    playerManpowerRegenPerMinute: vi.fn(() => 0),
    playerDefensiveness: vi.fn(() => 100),
    empireStyleFromPlayer: vi.fn(() => ({})),
    playerModBreakdown: vi.fn(() => ({})),
    playerManpowerBreakdown: vi.fn(() => ({ cap: [], regen: [] })),
    playerEconomySnapshot: vi.fn(() => ({
      incomePerMinute: 0,
      strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
      economyBreakdown: {},
      upkeepPerMinute: {},
      upkeepLastTick: {}
    })),
    availableTechPicks: vi.fn(() => 0),
    reachableDomains: vi.fn(() => []),
    activeDomainCatalog: vi.fn(() => []),
    revealCapacityForPlayer: vi.fn(() => 0),
    getOrInitRevealTargets: vi.fn((_: string): Set<string> => new Set<string>()),
    getAbilityCooldowns: vi.fn(() => new Map()),
    activeAetherBridgesForPlayer: vi.fn(() => []),
    activeAetherWallViews: vi.fn(() => []),
    incomingAllianceRequestsForPlayer: vi.fn(() => []),
    outgoingAllianceRequestsForPlayer: vi.fn(() => []),
    outgoingTruceRequestsForPlayer: vi.fn(() => []),
    activeTruceViewsForPlayer: vi.fn(() => []),
    missionPayload: vi.fn(() => []),
    currentLeaderboardSnapshot: vi.fn(() => ({ overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined, byTiles: [], byIncome: [], byTechs: [] })),
    currentVictoryPressureObjectives: vi.fn(() => []),
    seasonWinner: undefined,
    consumeRespawnNoticeForPlayer: vi.fn(() => undefined),
    recordServerDebugEvent: vi.fn(),
    appLogWarn: vi.fn()
  });

  return { runtime, socket };
};

describe("server player update runtime", () => {
  it("includes the missing-settlement diagnostic only while the empire is broken", () => {
    const diagnosticRef: { current: { key: string; detail: string } | undefined } = {
      current: {
        key: "missing-settlement:eligible:405,192",
        detail: "Your empire has no active settlement. Eligible settled tile: 405,192."
      }
    };
    const { runtime, socket } = createRuntimeHarness(diagnosticRef);
    const player = buildPlayer("player-1");
    const options = {
      detail: "full" as const,
      includeProgression: false,
      includeGlobalStatus: false,
      includeWorldStatus: false,
      includeEconomy: false,
      includeBreakdowns: false,
      includeSocial: false,
      includeMissions: false,
      includeAllianceRequests: false,
      includeDevelopmentStatus: false
    };

    runtime.sendPlayerUpdate(player, 0, options);
    diagnosticRef.current = undefined;
    runtime.sendPlayerUpdate(player, 0, options);

    const firstPayload = JSON.parse(socket.send.mock.calls[0]![0] as string) as Record<string, unknown>;
    const secondPayload = JSON.parse(socket.send.mock.calls[1]![0] as string) as Record<string, unknown>;

    expect(firstPayload.name).toBe("player-1");
    expect(firstPayload.settlementRepairDiagnostic).toEqual({
      key: "missing-settlement:eligible:405,192",
      detail: "Your empire has no active settlement. Eligible settled tile: 405,192."
    });
    expect(secondPayload.settlementRepairDiagnostic).toBeUndefined();
  });
});

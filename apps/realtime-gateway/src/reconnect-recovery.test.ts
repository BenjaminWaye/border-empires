import { describe, expect, it } from "vitest";

import type { DomainPlayer } from "@border-empires/game-domain";
import { InMemoryGatewayCommandStore } from "./command-store.js";
import { createPlayerProfileOverrides } from "./player-profile-overrides.js";
import { buildInitMessage } from "./reconnect-recovery.js";
import { createSocialState } from "./social-state.js";
import type { LegacySnapshotBootstrap } from "../../simulation/src/legacy-snapshot-bootstrap.js";

describe("buildInitMessage", () => {
  it("keeps frontier recovery empty for reconnecting players", async () => {
    const store = new InMemoryGatewayCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1000,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1001
    );
    await store.markAccepted("cmd-1", 1002);
    await store.persistQueuedCommand(
      {
        commandId: "cmd-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1003,
        type: "EXPAND",
        payloadJson: "{}"
      },
      1004
    );
    await store.markRejected("cmd-2", 1005, "SIMULATION_UNAVAILABLE", "failed");

    const init = await buildInitMessage({ playerId: "player-1", playerName: "Nauticus" }, store);
    expect(init.type).toBe("INIT");
    expect(init.supportedMessageTypes).toEqual(
      expect.arrayContaining(["ATTACK", "EXPAND", "BREAKTHROUGH_ATTACK", "SETTLE", "COLLECT_TILE", "COLLECT_VISIBLE", "CHOOSE_TECH", "CHOOSE_DOMAIN"])
    );
    expect(init.player).toEqual(
      expect.objectContaining({
        id: "player-1",
        name: "Nauticus",
        gold: 100,
        manpower: 150,
        techIds: [],
        tileColor: expect.stringMatching(/^#[0-9a-f]{6}$/i)
      })
    );
    expect(init.config).toEqual(
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
        season: expect.objectContaining({ seasonId: "rewrite-default", worldSeed: expect.any(Number) })
      })
    );
    expect(init.techCatalog).toEqual(expect.arrayContaining([expect.objectContaining({ id: "agriculture", name: "Agriculture" })]));
    expect(init.domainCatalog).toEqual(expect.arrayContaining([expect.objectContaining({ id: "frontier-doctrine", name: "Frontier Doctrine" })]));
    expect(init.leaderboard.overall).toEqual(expect.arrayContaining([expect.objectContaining({ id: "player-1", name: "Nauticus" })]));
    expect(init.playerStyles).toEqual(expect.arrayContaining([expect.objectContaining({ id: "player-1", name: "Nauticus" })]));
    expect(init.recovery).toEqual({
      nextClientSeq: 3,
      pendingCommands: []
    });
  });

  it("drops queued frontier commands from reconnect recovery", async () => {
    const store = new InMemoryGatewayCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-stale",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1000,
        type: "EXPAND",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      Date.now()
    );

    const init = await buildInitMessage({ playerId: "player-1", playerName: "Nauticus" }, store);

    expect(init.recovery).toEqual({
      nextClientSeq: 2,
      pendingCommands: []
    });
  });

  it("prefers live snapshot player state over seed-profile defaults on reconnect", async () => {
    const store = new InMemoryGatewayCommandStore();

    const init = await buildInitMessage(
      { playerId: "player-1", playerName: "Nauticus" },
      store,
      {
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Nauticus",
          gold: 64,
          manpower: 120,
          manpowerCap: 150,
          incomePerMinute: 4.8,
          strategicResources: { FOOD: 3, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          strategicProductionPerMinute: { FOOD: 3, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          economyBreakdown: { GOLD: { sources: [{ label: "Towns", amountPerMinute: 4.8, count: 2 }], sinks: [] }, FOOD: { sources: [{ label: "Grain", amountPerMinute: 3, count: 3 }], sinks: [] }, IRON: { sources: [], sinks: [] }, CRYSTAL: { sources: [], sinks: [] }, SUPPLY: { sources: [], sinks: [] }, SHARD: { sources: [], sinks: [] }, OIL: { sources: [], sinks: [] } },
          upkeepPerMinute: { food: 0.1, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0.2 },
          upkeepLastTick: { foodCoverage: 1, gold: { contributors: [] }, food: { contributors: [{ label: "Town", amountPerMinute: 0.1, count: 1 }] }, iron: { contributors: [] }, crystal: { contributors: [] }, supply: { contributors: [] }, oil: { contributors: [] } },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 2,
          pendingSettlements: [{ x: 10, y: 11, startedAt: 1_000, resolvesAt: 61_000 }],
          techIds: [],
          domainIds: []
        },
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
      },
      "season-20ai"
    );

    expect(init.player).toEqual(
      expect.objectContaining({
        gold: 64,
        manpower: 120,
        manpowerCap: 150,
        incomePerMinute: 4.8,
        activeDevelopmentProcessCount: 2,
        developmentProcessLimit: 3,
        pendingSettlements: [{ x: 10, y: 11, startedAt: 1_000, resolvesAt: 61_000 }],
        strategicResources: expect.objectContaining({ FOOD: 3 }),
        strategicProductionPerMinute: expect.objectContaining({ FOOD: 3 }),
        economyBreakdown: expect.objectContaining({
          GOLD: expect.objectContaining({ sources: expect.any(Array) })
        }),
        upkeepPerMinute: expect.objectContaining({ food: 0.1, gold: 0.2 }),
        upkeepLastTick: expect.objectContaining({ foodCoverage: 1 })
      })
    );
  });

  it("falls back to empty recovery state when command-store reads stall", async () => {
    const hangingStore = {
      nextClientSeqForPlayer: async () => await new Promise<number>(() => undefined),
      listUnresolvedForPlayer: async () =>
        await new Promise<
          Array<{
            commandId: string;
            clientSeq: number;
            type: string;
            status: "QUEUED" | "ACCEPTED";
            payloadJson: string;
            queuedAt: number;
          }>
        >(() => undefined)
    } as const;

    const startedAt = Date.now();
    const init = await buildInitMessage(
      { playerId: "player-1", playerName: "Nauticus" },
      hangingStore as never,
      {
        playerId: "player-1",
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
      }
    );

    expect(Date.now() - startedAt).toBeLessThan(2_500);
    expect(init.recovery).toEqual({
      nextClientSeq: 1,
      pendingCommands: []
    });
  });

  it("includes season victory objectives for snapshot-backed rewrite bootstrap", async () => {
    const store = new InMemoryGatewayCommandStore();
    const players = new Map<string, DomainPlayer>([
      [
        "player-1",
        {
          id: "player-1",
          isAi: false,
          name: "Nauticus",
          points: 100,
          manpower: 100,
          techIds: new Set<string>(),
          domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techRootId: "rewrite-local",
          allies: new Set<string>()
        }
      ],
      [
        "ai-1",
        {
          id: "ai-1",
          isAi: true,
          name: "BlackFang",
          points: 120,
          manpower: 100,
          techIds: new Set<string>(),
          domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techRootId: "rewrite-local",
          allies: new Set<string>()
        }
      ]
    ]);
    const snapshotBootstrap: LegacySnapshotBootstrap = {
      runtimeIdentity: {
        sourceType: "legacy-snapshot",
        seasonId: "season-1",
        worldSeed: 123,
        snapshotLabel: ".prod-snapshot-copy",
        fingerprint: "snap-abc123",
        playerCount: 2,
        seededTileCount: 16
      },
      season: { seasonId: "season-1", worldSeed: 123 },
      seasonVictory: [["TOWN_CONTROL", { leaderPlayerId: "ai-1", holdStartedAt: Date.now() - 60_000 }]],
      players,
      playerProfiles: new Map([
        [
          "player-1",
          {
            id: "player-1",
            name: "Nauticus",
            points: 100,
            manpower: 100,
            incomePerMinute: 150,
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 },
            upkeepLastTick: { foodCoverage: 1 },
            economyBreakdown: { GOLD: { sources: [], sinks: [] }, FOOD: { sources: [], sinks: [] }, IRON: { sources: [], sinks: [] }, CRYSTAL: { sources: [], sinks: [] }, SUPPLY: { sources: [], sinks: [] }, SHARD: { sources: [], sinks: [] } },
            techIds: [],
            domainIds: [],
            isAi: false,
            capitalTile: { x: 0, y: 0 }
          }
        ],
        [
          "ai-1",
          {
            id: "ai-1",
            name: "BlackFang",
            points: 120,
            manpower: 100,
            incomePerMinute: 250,
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
            upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 },
            upkeepLastTick: { foodCoverage: 1 },
            economyBreakdown: { GOLD: { sources: [], sinks: [] }, FOOD: { sources: [], sinks: [] }, IRON: { sources: [], sinks: [] }, CRYSTAL: { sources: [], sinks: [] }, SUPPLY: { sources: [], sinks: [] }, SHARD: { sources: [], sinks: [] } },
            techIds: [],
            domainIds: [],
            isAi: true,
            capitalTile: { x: 2, y: 2 }
          }
        ]
      ]),
      authIdentities: [],
      docks: [
        { dockId: "dock-a", tileKey: "0,0", pairedDockId: "dock-b" },
        { dockId: "dock-b", tileKey: "2,2", pairedDockId: "dock-a" }
      ],
      clusters: [{ clusterId: "cluster-1", type: "IRON_BELT", centerTileKey: "1,1", tileKeys: ["1,1"] }],
      seedTiles: new Map([
        ["0,0", { x: 0, y: 0, terrain: "LAND" }],
        ["0,1", { x: 0, y: 1, terrain: "LAND" }],
        ["1,0", { x: 1, y: 0, terrain: "LAND" }],
        ["1,1", { x: 1, y: 1, terrain: "LAND" }],
        ["2,2", { x: 2, y: 2, terrain: "LAND" }],
        ["2,3", { x: 2, y: 3, terrain: "LAND" }]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Home" }, resource: "FARM" },
          { x: 0, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 1, y: 1, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", name: "Enemy" }, resource: "IRON" },
          { x: 2, y: 2, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 2, y: 3, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    };

    const message = await buildInitMessage(
      { playerId: "player-1", playerName: "Nauticus" },
      store,
      {
        tiles: snapshotBootstrap.initialState.tiles.map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
          ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.town ? { townType: tile.town.type, townName: tile.town.name } : {})
        }))
      },
      "default",
      snapshotBootstrap
    );

    expect(message.seasonVictory).toHaveLength(5);
    expect(message.mapMeta).toEqual(
      expect.objectContaining({
        dockCount: 2,
        dockPairCount: 1,
        clusterCount: 1,
        townCount: 2,
        dockPairs: [{ ax: 0, ay: 0, bx: 2, by: 2 }]
      })
    );
    expect(message.seasonVictory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "TOWN_CONTROL",
          name: "Town Control"
        }),
        expect.objectContaining({
          id: "ECONOMIC_HEGEMONY",
          name: "Economic Ascendancy"
        })
      ])
    );
  });

  it("prefers authoritative world status from the rewrite snapshot for leaderboard and season goals", async () => {
    const store = new InMemoryGatewayCommandStore();

    const message = await buildInitMessage(
      { playerId: "player-1", playerName: "Nauticus" },
      store,
      {
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Nauticus",
          gold: 64,
          manpower: 120,
          manpowerCap: 150,
          incomePerMinute: 1.2,
          strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          strategicProductionPerMinute: { FOOD: 2, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          developmentProcessLimit: 3,
          activeDevelopmentProcessCount: 0,
          pendingSettlements: [],
          techIds: [],
          domainIds: []
        },
        worldStatus: {
          leaderboard: {
            overall: [
              { id: "ai-1", name: "AI 1", tiles: 7, incomePerMinute: 4.2, techs: 1, score: 180, rank: 1 },
              { id: "player-1", name: "Nauticus", tiles: 2, incomePerMinute: 1.2, techs: 0, score: 100, rank: 2 }
            ],
            selfOverall: { id: "player-1", name: "Nauticus", tiles: 2, incomePerMinute: 1.2, techs: 0, score: 100, rank: 2 },
            byTiles: [
              { id: "ai-1", name: "AI 1", value: 7, rank: 1 },
              { id: "player-1", name: "Nauticus", value: 2, rank: 2 }
            ],
            selfByTiles: { id: "player-1", name: "Nauticus", value: 2, rank: 2 },
            byIncome: [
              { id: "ai-1", name: "AI 1", value: 4.2, rank: 1 },
              { id: "player-1", name: "Nauticus", value: 1.2, rank: 2 }
            ],
            selfByIncome: { id: "player-1", name: "Nauticus", value: 1.2, rank: 2 },
            byTechs: [
              { id: "ai-1", name: "AI 1", value: 1, rank: 1 },
              { id: "player-1", name: "Nauticus", value: 0, rank: 2 }
            ],
            selfByTechs: { id: "player-1", name: "Nauticus", value: 0, rank: 2 }
          },
          seasonVictory: [
            {
              id: "TOWN_CONTROL",
              name: "Town Control",
              description: "Own a dominant share of towns.",
              leaderPlayerId: "ai-1",
              leaderName: "AI 1",
              progressLabel: "3/5 towns",
              selfProgressLabel: "1/5 towns",
              thresholdLabel: "Need 5 towns",
              holdDurationSeconds: 21600,
              statusLabel: "Pressure building",
              conditionMet: false
            }
          ]
        },
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
      },
      "season-20ai"
    );

    expect(message.leaderboard.overall).toEqual([
      expect.objectContaining({ id: "ai-1", name: "AI 1", tiles: 7, incomePerMinute: 4.2 }),
      expect.objectContaining({ id: "player-1", name: "Nauticus", tiles: 2, incomePerMinute: 1.2 })
    ]);
    expect(message.seasonVictory).toEqual([
      expect.objectContaining({ id: "TOWN_CONTROL", leaderName: "AI 1", selfProgressLabel: "1/5 towns" })
    ]);
  });

  it("applies runtime profile overrides to init player and leaderboard payloads", async () => {
    const store = new InMemoryGatewayCommandStore();
    const overrides = createPlayerProfileOverrides();
    overrides.setProfile("player-1", "Nauticus Prime", "#123456");

    const init = await buildInitMessage(
      { playerId: "player-1", playerName: "Nauticus" },
      store,
      undefined,
      "default",
      undefined,
      overrides
    );

    expect(init.player).toEqual(
      expect.objectContaining({
        name: "Nauticus Prime",
        tileColor: "#123456",
        profileNeedsSetup: false
      })
    );
    expect(init.playerStyles).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "player-1", name: "Nauticus Prime", tileColor: "#123456" })])
    );
    expect(init.leaderboard.overall).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "player-1", name: "Nauticus Prime" })])
    );
  });

  it("requires profile setup for seed-profile humans until they pick a name and color", async () => {
    const store = new InMemoryGatewayCommandStore();

    const init = await buildInitMessage(
      { playerId: "player-1", playerName: "Nauticus" },
      store,
      undefined,
      "season-20ai"
    );

    expect(init.player).toEqual(expect.objectContaining({ profileNeedsSetup: true }));
  });

  it("includes alliance and truce state in rewrite init bootstrap", async () => {
    const store = new InMemoryGatewayCommandStore();
    const social = createSocialState({
      now: () => 10_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" }
      ]
    });

    expect(social.requestAlliance("player-2", "Nauticus").ok).toBe(true);
    expect(social.requestAlliance("player-1", "Beejac").ok).toBe(true);
    expect(social.requestTruce("player-3", "Nauticus", 12).ok).toBe(true);
    expect(social.requestTruce("player-1", "Valka", 24).ok).toBe(true);

    const init = await buildInitMessage({ playerId: "player-1", playerName: "Nauticus" }, store, undefined, "default", undefined, undefined, social);

    expect(init.player).toEqual(expect.objectContaining({ allies: [] }));
    expect(init.allianceRequests).toEqual([
      expect.objectContaining({ fromPlayerId: "player-2", toPlayerId: "player-1", fromName: "Valka", toName: "Nauticus" })
    ]);
    expect(init.outgoingAllianceRequests).toEqual([
      expect.objectContaining({ fromPlayerId: "player-1", toPlayerId: "player-3", fromName: "Nauticus", toName: "Beejac" })
    ]);
    expect(init.truceRequests).toEqual([
      expect.objectContaining({ fromPlayerId: "player-3", toPlayerId: "player-1", fromName: "Beejac", toName: "Nauticus", durationHours: 12 })
    ]);
    expect(init.outgoingTruceRequests).toEqual([
      expect.objectContaining({ fromPlayerId: "player-1", toPlayerId: "player-2", fromName: "Nauticus", toName: "Valka", durationHours: 24 })
    ]);
    expect(init.activeTruces).toEqual([]);
  });
});

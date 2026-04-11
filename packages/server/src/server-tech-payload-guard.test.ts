import type { Player } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import type { SeasonalTechConfig } from "./server-shared-types.js";
import { resolvePlayerTechPayloadSnapshot } from "./server-tech-payload-guard.js";

const makeConfig = (configId: string, ids: string[]): SeasonalTechConfig => ({
  configId,
  rootNodeIds: ids.length > 0 ? [ids[0]!] : [],
  activeNodeIds: new Set(ids),
  balanceConstants: {}
});

const makePlayer = (): Player =>
  ({
    id: "p1",
    name: "P1",
    level: 1,
    points: 100,
    stamina: 100,
    staminaUpdatedAt: 0,
    manpower: 0,
    manpowerUpdatedAt: 0,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    territoryTiles: new Set<`${number},${number}`>(),
    allies: new Set<string>(),
    powerups: {},
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    tileColor: "#fff",
    profileComplete: true,
    missions: [],
    missionStats: {
      neutralCaptures: 0,
      enemyCaptures: 0,
      combatWins: 0,
      maxTilesHeld: 0,
      maxSettledTilesHeld: 0,
      maxFarmsHeld: 0,
      maxContinentsHeld: 0,
      maxTechPicks: 0
    },
    T: 0,
    E: 0,
    Ts: 0,
    Es: 0,
    spawnShieldUntil: 0,
    isEliminated: false,
    respawnPending: false,
    lastActiveAt: 0,
    activityInbox: []
  }) satisfies Player;

describe("resolvePlayerTechPayloadSnapshot", () => {
  it("repairs an empty season config before building a payload", () => {
    let activeSeasonTechConfig = makeConfig("boot-empty", []);
    const repaired = makeConfig("live-tree", ["agriculture", "toolmaking"]);

    const snapshot = resolvePlayerTechPayloadSnapshot({
      player: makePlayer(),
      activeSeasonTechConfig,
      worldSeed: 42,
      chooseSeasonalTechConfig: () => repaired,
      seasonTechConfigIsCompatible: (config) => config.activeNodeIds.size > 0,
      setActiveSeasonTechConfig: (config) => {
        activeSeasonTechConfig = config;
      },
      reachableTechs: () => [...activeSeasonTechConfig.activeNodeIds],
      activeTechCatalog: () => [...activeSeasonTechConfig.activeNodeIds].map((id) => ({ id })),
      onRepair: vi.fn()
    });

    expect(snapshot.techChoices).toEqual(["agriculture", "toolmaking"]);
    expect(snapshot.techCatalog).toEqual([{ id: "agriculture" }, { id: "toolmaking" }]);
    expect(activeSeasonTechConfig.configId).toBe("live-tree");
  });

  it("retries after an unexpectedly empty catalog under an active config", () => {
    const activeSeasonTechConfig = makeConfig("live-tree", ["agriculture", "toolmaking"]);
    const onRepair = vi.fn();
    let catalogReads = 0;

    const snapshot = resolvePlayerTechPayloadSnapshot({
      player: makePlayer(),
      activeSeasonTechConfig,
      worldSeed: 42,
      chooseSeasonalTechConfig: () => activeSeasonTechConfig,
      seasonTechConfigIsCompatible: () => true,
      setActiveSeasonTechConfig: () => {},
      reachableTechs: () => ["agriculture", "toolmaking"],
      activeTechCatalog: () => {
        catalogReads += 1;
        if (catalogReads === 1) return [];
        return [{ id: "agriculture" }, { id: "toolmaking" }];
      },
      onRepair
    });

    expect(catalogReads).toBe(2);
    expect(onRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "empty_catalog",
        nextActiveNodeCount: 2,
        previousActiveNodeCount: 2
      })
    );
    expect(snapshot.techCatalog).toEqual([{ id: "agriculture" }, { id: "toolmaking" }]);
  });
});

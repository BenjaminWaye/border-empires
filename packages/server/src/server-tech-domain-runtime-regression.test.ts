import { describe, expect, it } from "vitest";
import { createServerTechDomainRuntime } from "./server-tech-domain-runtime.js";

describe("server tech domain runtime", () => {
  it("reads the latest season tech config after bootstrap reassigns it", () => {
    const techs = [
      {
        id: "agriculture",
        tier: 1,
        name: "Agriculture",
        description: "Food output",
        mods: { income: 1.1 }
      },
      {
        id: "toolmaking",
        tier: 1,
        name: "Toolmaking",
        description: "Supply output",
        mods: { defense: 1.1 }
      }
    ] as const;
    let activeSeasonTechConfig = {
      configId: "boot-empty",
      rootNodeIds: [] as string[],
      activeNodeIds: new Set<string>(),
      balanceConstants: {}
    };
    const runtime = createServerTechDomainRuntime({
      TECHS: techs,
      activeSeasonTechConfig,
      getActiveSeasonTechConfig: () => activeSeasonTechConfig,
      techById: new Map(techs.map((tech) => [tech.id, tech])),
      domainById: new Map(),
      ownershipStateByTile: new Map(),
      parseKey: () => [0, 0],
      runtimeTileCore: () => ({ resource: undefined }),
      docksByTile: new Map(),
      townsByTile: new Map(),
      getOrInitStrategicStocks: () => ({}),
      recomputeTechModsFromOwnedTechs: () => {},
      telemetryCounters: { techUnlocks: 0 },
      DOMAINS: [],
      colorFromId: () => "#000000"
    });

    activeSeasonTechConfig = {
      configId: "season-live",
      rootNodeIds: ["agriculture", "toolmaking"],
      activeNodeIds: new Set<string>(["agriculture", "toolmaking"]),
      balanceConstants: {}
    };

    const player = {
      id: "p1",
      points: 100,
      techIds: new Set<string>(),
      Ts: 0,
      territoryTiles: new Set<string>(),
      domainIds: new Set<string>()
    };

    expect(runtime.reachableTechs(player)).toEqual(["agriculture", "toolmaking"]);
    expect(runtime.activeTechCatalog(player).map((tech: { id: string }) => tech.id)).toEqual(["agriculture", "toolmaking"]);
  });
});

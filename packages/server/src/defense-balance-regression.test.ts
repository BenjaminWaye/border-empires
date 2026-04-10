import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { loadDomainTree } from "./domain-tree.js";
import { supportedFrontierUsesSettledDefense } from "./frontier-defense.js";
import { createServerSeasonTech } from "./server-season-tech.js";
import { loadTechTree } from "./tech-tree.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("defense balance regression guard", () => {
  it("gates settled-grade frontier defense behind Frontier Bureau", () => {
    const deps = {
      worldWidth: 100,
      worldHeight: 100,
      key: (x: number, y: number) => `${x},${y}` as `${number},${number}`,
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      ownerAt: (tileKey: string) => (tileKey === "9,9" || tileKey === "10,10" ? "defender" : undefined),
      ownershipStateAt: (tileKey: string) => (tileKey === "9,9" ? "SETTLED" : tileKey === "10,10" ? "FRONTIER" : undefined)
    };

    expect(supportedFrontierUsesSettledDefense(new Set(["frontier-bureau"]), "defender", { x: 10, y: 10, ownershipState: "FRONTIER" }, deps)).toBe(true);
    expect(supportedFrontierUsesSettledDefense(new Set<string>(), "defender", { x: 10, y: 10, ownershipState: "FRONTIER" }, deps)).toBe(false);
  });

  it("treats missing frontier targets as unsupported instead of crashing combat logic", () => {
    const deps = {
      worldWidth: 100,
      worldHeight: 100,
      key: (x: number, y: number) => `${x},${y}` as `${number},${number}`,
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      ownerAt: () => undefined,
      ownershipStateAt: () => undefined
    };

    expect(supportedFrontierUsesSettledDefense(new Set(["frontier-bureau"]), "defender", undefined, deps)).toBe(false);
  });

  it("replaces the old flat Frontier Bureau defense bonus with the settled-frontier rule", () => {
    const domains = loadDomainTree(resolve(here, "..")).domains;
    const byId = new Map(domains.map((domain) => [domain.id, domain]));

    expect(byId.get("frontier-bureau")?.effects?.frontierDefenseAdd).toBeUndefined();
    expect(byId.get("frontier-bureau")?.description).toContain("supported frontier");
  });

  it("makes generic military tech stack attack and defense together", () => {
    const techs = loadTechTree(resolve(here, ".."));
    const domains = loadDomainTree(resolve(here, ".."));
    const player = {
      id: "p1",
      techIds: new Set(["tribal-warfare", "bronze-working", "steelworking"]),
      domainIds: new Set(["war-foundries", "iron-dominion"]),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 }
    } as any;

    const seasonTech = createServerSeasonTech({
      TECHS: techs.techs,
      TECH_ROOTS: [],
      techById: techs.techById,
      domainById: domains.domainById,
      players: new Map([[player.id, player]]),
      playerBaseMods: new Map(),
      clusterControlledTilesByPlayer: new Map(),
      recomputePlayerEffectsForPlayer: vi.fn(),
      markVisibilityDirty: vi.fn()
    });

    seasonTech.recomputeTechModsFromOwnedTechs(player);

    expect(player.mods.attack).toBeCloseTo(1.7240685, 6);
    expect(player.mods.defense).toBeCloseTo(1.7240685, 6);
  });
});

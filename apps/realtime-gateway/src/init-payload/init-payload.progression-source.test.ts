import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DOMAIN_TREE_PATH,
  DOMAIN_TREE_RELATIVE_CANDIDATES,
  TECH_TREE_PATH,
  TECH_TREE_RELATIVE_CANDIDATES,
  buildGatewayInitPayload,
  resolveDataPath
} from "./init-payload.js";

const MODULE_URL = new URL("./init-payload.js", import.meta.url).href;
const EXPECTED_TECH_TREE_PATH = fileURLToPath(new URL("../../../../packages/game-domain/data/tech-tree.json", import.meta.url));
const EXPECTED_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../../packages/game-domain/data/domain-tree.json", import.meta.url));

describe("gateway init progression sources", () => {
  it("loads the packaged game-domain tech tree file", () => {
    expect(realpathSync(TECH_TREE_PATH)).toBe(realpathSync(EXPECTED_TECH_TREE_PATH));
    expect(readFileSync(TECH_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_TECH_TREE_PATH, "utf8"));
  });

  it("serves the current Aether Moorings ability unlocks", () => {
    const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: Array<{ id: string; effects?: Record<string, unknown> }> };
    const harborcraft = techTree.techs.find((tech) => tech.id === "harborcraft");

    expect(harborcraft?.effects).toMatchObject({
      unlockCustomsHouse: true,
      unlockAetherWall: true
    });
  });

  it("loads the packaged game-domain domain tree file", () => {
    expect(realpathSync(DOMAIN_TREE_PATH)).toBe(realpathSync(EXPECTED_DOMAIN_TREE_PATH));
    expect(readFileSync(DOMAIN_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_DOMAIN_TREE_PATH, "utf8"));
  });

  it("only considers game-domain tech tree paths", () => {
    expect(TECH_TREE_RELATIVE_CANDIDATES.every((candidate) => candidate.includes("packages/game-domain/data"))).toBe(true);
    expect(TECH_TREE_RELATIVE_CANDIDATES.some((candidate) => candidate.includes("packages/server"))).toBe(false);
  });

  it("only considers game-domain domain tree paths", () => {
    expect(DOMAIN_TREE_RELATIVE_CANDIDATES.every((candidate) => candidate.includes("packages/game-domain/data"))).toBe(true);
    expect(DOMAIN_TREE_RELATIVE_CANDIDATES.some((candidate) => candidate.includes("packages/server"))).toBe(false);
  });

  it("falls through candidates until one exists on disk", () => {
    const resolved = resolveDataPath(TECH_TREE_RELATIVE_CANDIDATES, {
      from: MODULE_URL,
      exists: (path) => path === EXPECTED_TECH_TREE_PATH
    });

    expect(resolved).toBe(EXPECTED_TECH_TREE_PATH);
  });

  it("keeps tier 2 domain choices open on init after a tier 1 domain is chosen", () => {
    const initialState: NonNullable<Parameters<typeof buildGatewayInitPayload>[1]> = {
      playerId: "player-1",
      player: {
        id: "player-1",
        name: "Nauticus",
        gold: 100_000,
        manpower: 150,
        manpowerCap: 150,
        incomePerMinute: 0,
        strategicResources: { FOOD: 10_000, IRON: 10_000, CRYSTAL: 10_000, SUPPLY: 10_000, SHARD: 10_000 },
        strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
        upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0,  gold: 0 },
        techIds: ["toolmaking"],
        domainIds: ["frontier-doctrine"]
      },
      tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
    };
    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      initialState,
      "default"
    );

    expect(init.domainChoices).toEqual(expect.arrayContaining(["cogwork-foundries", "stone-curtain"]));
    expect(init.domainChoices).not.toContain("frontier-doctrine");
    expect(init.domainCatalog.find((domain) => domain.id === "cogwork-foundries")?.requirements.canResearch).toBe(false);
  });
});

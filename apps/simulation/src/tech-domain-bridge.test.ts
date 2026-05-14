import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DOMAIN_TREE_PATH,
  DOMAIN_TREE_RELATIVE_CANDIDATES,
  TECH_TREE_PATH,
  TECH_TREE_RELATIVE_CANDIDATES,
  buildDomainUpdatePayload,
  buildModBreakdownForPlayer,
  recomputeMods,
  resolveDataPath
} from "./tech-domain-bridge.js";

const MODULE_URL = new URL("./tech-domain-bridge.js", import.meta.url).href;
const EXPECTED_TECH_TREE_PATH = fileURLToPath(new URL("../../../packages/server/data/tech-tree.json", import.meta.url));
const EXPECTED_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../packages/server/data/domain-tree.json", import.meta.url));
const FALLBACK_TECH_TREE_PATH = fileURLToPath(new URL("../../../packages/game-domain/data/tech-tree.json", import.meta.url));
const FALLBACK_DOMAIN_TREE_PATH = fileURLToPath(new URL("../../../packages/game-domain/data/domain-tree.json", import.meta.url));

describe("tech-domain bridge progression sources", () => {
  it("loads the current server tech tree file", () => {
    expect(realpathSync(TECH_TREE_PATH)).toBe(realpathSync(EXPECTED_TECH_TREE_PATH));
    expect(readFileSync(TECH_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_TECH_TREE_PATH, "utf8"));
  });

  it("uses the current Aether Moorings ability unlocks", () => {
    const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: Array<{ id: string; effects?: Record<string, unknown> }> };
    const harborcraft = techTree.techs.find((tech) => tech.id === "harborcraft");

    expect(harborcraft?.effects).toMatchObject({
      unlockCustomsHouse: true,
      unlockAetherWall: true
    });
  });

  it("keeps the packaged tech fallback synchronized with the current tech tree", () => {
    expect(readFileSync(FALLBACK_TECH_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_TECH_TREE_PATH, "utf8"));
  });

  it("loads the current server domain tree file", () => {
    expect(realpathSync(DOMAIN_TREE_PATH)).toBe(realpathSync(EXPECTED_DOMAIN_TREE_PATH));
    expect(readFileSync(DOMAIN_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_DOMAIN_TREE_PATH, "utf8"));
  });

  it("keeps the packaged domain fallback synchronized with the current domain tree", () => {
    expect(readFileSync(FALLBACK_DOMAIN_TREE_PATH, "utf8")).toBe(readFileSync(EXPECTED_DOMAIN_TREE_PATH, "utf8"));
  });

  it("falls back to packaged game-domain tech data when server data is unavailable", () => {
    const resolved = resolveDataPath(TECH_TREE_RELATIVE_CANDIDATES, {
      from: MODULE_URL,
      exists: (path) => path === FALLBACK_TECH_TREE_PATH
    });

    expect(resolved).toBe(FALLBACK_TECH_TREE_PATH);
  });

  it("falls back to packaged game-domain domain data when server data is unavailable", () => {
    const resolved = resolveDataPath(DOMAIN_TREE_RELATIVE_CANDIDATES, {
      from: MODULE_URL,
      exists: (path) => path === FALLBACK_DOMAIN_TREE_PATH
    });

    expect(resolved).toBe(FALLBACK_DOMAIN_TREE_PATH);
  });

  it("recomputes active stat mods and source labels from unlocked techs", () => {
    const player = {
      techIds: new Set<string>(["tribal-warfare"]),
      domainIds: new Set<string>()
    };

    expect(recomputeMods(player)).toEqual({ attack: 1.05, defense: 1.05, income: 1, vision: 1 });
    expect(buildModBreakdownForPlayer(player).attack).toEqual([
      { label: "Base", mult: 1 },
      { label: "Warbands", mult: 1.05 }
    ]);
  });

  it("uses authoritative income when building domain update payloads", () => {
    const player = {
      id: "player-1",
      isAi: false,
      points: 0,
      manpower: 0,
      techIds: new Set<string>(["trade"]),
      domainIds: new Set<string>(["mercantile-charter"]),
      allies: new Set<string>(),
      strategicResources: {}
    };

    expect(buildDomainUpdatePayload(player, [], { incomePerMinute: 15.4 }).incomePerMinute).toBe(15.4);
  });
});

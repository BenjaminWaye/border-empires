import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { chooseAutomationPreplanCommand } from "./ai-preplan-command.js";
import { DOMAIN_TREE_PATH, TECH_TREE_PATH } from "../tech-domain-bridge/tech-domain-bridge.js";

const techCatalog = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: { id: string }[] };
const domainCatalog = JSON.parse(readFileSync(DOMAIN_TREE_PATH, "utf8")) as { domains: { id: string }[] };

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    ownershipState: string;
    resource: string;
    dockId: string;
    town: {
      name?: string;
      type?: "MARKET" | "FARMING";
      populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
      population?: number;
    } | null;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation preplan command", () => {
  it("defers to main planner when AI has an active lock but income is passive", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Locktown", populationTier: "TOWN" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 500,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 2,
      hasActiveLock: true,
      ownedTiles: [town],
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // With passive income, there's no more COLLECT_VISIBLE preempt.
    // Low-points AIs without affordable progression defer to main planner.
    expect(result.command).toBeUndefined();
    expect(result.diagnostic.preplanReason).toBeDefined();
  });

  it("defers to main planner when AI is too poor and has no affordable progression", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Seed", populationTier: "SETTLEMENT" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 3,
      techIds: [],
      domainIds: [],
      strategicResources: { FOOD: 80, CRYSTAL: 40 },
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 1,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.preplanProgressState).toBe("tech_unaffordable");
  });

  it("defers to main planner when AI can afford to expand even though tech is unaffordable", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Seed", populationTier: "SETTLEMENT" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 100,
      techIds: [],
      domainIds: [],
      strategicResources: { FOOD: 80, CRYSTAL: 40 },
      settledTileCount: 3,
      townCount: 1,
      incomePerMinute: 1,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 3,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.preplanProgressState).toBe("tech_unaffordable");
  });

  it("chooses the best affordable tech when no collection recovery is needed", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 2_500,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 6,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 3,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "CHOOSE_TECH",
      payloadJson: JSON.stringify({ techId: "toolmaking" })
    });
    expect(result.diagnostic.preplanReason).toBe("choose_tech");
  });

  it("chooses the best affordable domain after the enabling tech is owned", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Harborview", populationTier: "TOWN" }
    });
    const dock = makeTile(1, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      dockId: "dock-a"
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 7_000,
      techIds: ["toolmaking", "trade"],
      domainIds: [],
      strategicResources: { CRYSTAL: 120 },
      settledTileCount: 2,
      townCount: 1,
      incomePerMinute: 8,
      hasActiveLock: false,
      ownedTiles: [town, dock],
      clientSeq: 4,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "CHOOSE_DOMAIN",
      payloadJson: JSON.stringify({ domainId: "mercantile-charter" })
    });
    expect(result.diagnostic.preplanReason).toBe("choose_domain");
    // Both progression categories are now affordable: with the affordability-
    // first sort in chooseAiTechChoiceForPlayer, the planner can find an
    // affordable tech (e.g. cartography, gold + small crystal) even when the
    // top-scored harborcraft is unaffordable. The state reflects that both a
    // tech and a domain are payable; the planner still picks the higher-
    // scoring CHOOSE_DOMAIN (mercantile-charter) as the command.
    expect(result.diagnostic.preplanProgressState).toBe("tech_and_domain_affordable");
  });

  it("defers with no-reachable-progression when all tech/domain is already unlocked", () => {
    const settlement = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN" },
      resource: "FARM"
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 3,
      techIds: techCatalog.techs.map((tech) => tech.id),
      domainIds: domainCatalog.domains.map((domain) => domain.id),
      strategicResources: {},
      settledTileCount: 18,
      townCount: 1,
      incomePerMinute: 1,
      hasActiveLock: false,
      ownedTiles: [settlement],
      clientSeq: 5,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    // All progression choices exhausted — this is no_reachable_progression
    expect(result.diagnostic.preplanReason).toBe("defer_no_reachable_progression");
  });

  it("defers to main planner for a wealthy AI with rich town — no heartbeat collect needed with passive income", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Affluent", populationTier: "TOWN" }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 10_000,
      techIds: techCatalog.techs.map((tech) => tech.id),
      domainIds: domainCatalog.domains.map((domain) => domain.id),
      strategicResources: { FOOD: 500, IRON: 500, CRYSTAL: 500, SUPPLY: 500 },
      settledTileCount: 20,
      townCount: 5,
      incomePerMinute: 200,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 7,
      issuedAt: 1_000_000,
      sessionPrefix: "ai-runtime"
    });

    // With passive income there is no collect heartbeat — wealthy AIs with all
    // techs/domains should defer to the main planner.
    expect(result.command).toBeUndefined();
    expect(result.diagnostic.preplanReason).toBe("defer_no_reachable_progression");
  });

  it("upgrades a TOWN to CITY when population and food are sufficient, ahead of tech/domain choices", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN", population: 150_000 }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 2_500,
      techIds: [],
      domainIds: [],
      strategicResources: { FOOD: 600 },
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 6,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "UPGRADE_TOWN_TIER",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    expect(result.diagnostic.preplanReason).toBe("upgrade_town_tier");
  });

  it("does not upgrade a town below the population threshold, falling through to tech choice", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN", population: 50_000 }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 2_500,
      techIds: [],
      domainIds: [],
      strategicResources: { FOOD: 600 },
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 6,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({ type: "CHOOSE_TECH" });
  });

  it("does not upgrade a town when the FOOD stockpile can't cover the lump-sum cost", () => {
    const town = makeTile(0, 0, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      town: { name: "Core", populationTier: "TOWN", population: 150_000 }
    });

    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 2_500,
      techIds: [],
      domainIds: [],
      strategicResources: { FOOD: 100 },
      settledTileCount: 1,
      townCount: 1,
      incomePerMinute: 6,
      hasActiveLock: false,
      ownedTiles: [town],
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({ type: "CHOOSE_TECH" });
  });

  it("reports missing progression reachability when there is nothing legal to pick", () => {
    const result = chooseAutomationPreplanCommand({
      playerId: "ai-1",
      points: 900,
      techIds: techCatalog.techs.map((tech) => tech.id),
      domainIds: domainCatalog.domains.map((domain) => domain.id),
      strategicResources: {},
      settledTileCount: 40,
      townCount: 2,
      incomePerMinute: 10,
      hasActiveLock: false,
      ownedTiles: [],
      clientSeq: 6,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toBeUndefined();
    expect(result.diagnostic.preplanReason).toBe("defer_no_reachable_progression");
    expect(result.diagnostic.preplanProgressState).toBe("no_reachable_progression");
  });
});

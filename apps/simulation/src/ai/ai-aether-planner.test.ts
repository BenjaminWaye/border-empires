import { describe, expect, it } from "vitest";
import { chooseAiAetherCommand } from "./ai-aether-planner.js";
import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";

const tile = (x: number, extra: Partial<AutomationPlannerTile> = {}): AutomationPlannerTile => ({ x, y: 10, terrain: "LAND", ...extra });
const tower = (extra: Partial<NonNullable<AutomationPlannerTile["observatory"]>> = {}) => tile(10, {
  ownerId: "ai-1", ownershipState: "SETTLED", observatory: { ownerId: "ai-1", status: "active", ...extra }
});
const enemy = () => tile(12, { ownerId: "enemy", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
function input(tiles: AutomationPlannerTile[], overrides: Partial<AutomationPlannerInput<AutomationPlannerTile>> = {}): AutomationPlannerInput<AutomationPlannerTile> {
  return { playerId: "ai-1", points: 1000, manpower: 1000, hasActiveLock: false, activeDevelopmentProcessCount: 0,
    frontierTiles: [], ownedTiles: tiles.filter(t => t.ownerId === "ai-1"), tilesByKey: new Map(tiles.map(t => [`${t.x},${t.y}`, t])),
    ownedStructureCounts: { OBSERVATORY: tiles.filter(t => t.observatory?.ownerId === "ai-1").length },
    tacticalView: { visibleTileKeys: tiles.map(t => `${t.x},${t.y}`), dormantObservatoryKeys: [], castRange: 20 },
    techIds: ["crystal-lattices"], slotSupplyByResource: { FOOD: 10, CRYSTAL: 10 }, slotDemandByResource: { FOOD: 0, CRYSTAL: 1 },
    clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime", ...overrides };
}

describe("AI aether tactics", () => {
  it("purges a valuable hostile target with a ready tower", () => {
    expect(chooseAiAetherCommand(input([tower(), enemy()]))?.command).toMatchObject({ type: "AETHER_LANCE", payloadJson: JSON.stringify({ x: 12, y: 10 }) });
  });
  it("never targets allies or truce partners", () => {
    expect(chooseAiAetherCommand(input([tower(), enemy()], { nonHostilePlayerIds: new Set(["enemy"]) }))).toBeUndefined();
  });
  it("cannot use another AI's hidden tiles in the shared worker map", () => {
    const data = input([tower(), enemy()]);
    data.tacticalView = { visibleTileKeys: ["10,10"], dormantObservatoryKeys: [], castRange: 20 };
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
  it("checks unlocks, cooldowns, resource dormancy and siphon locks", () => {
    expect(chooseAiAetherCommand(input([tower(), enemy()], { techIds: [] }))).toBeUndefined();
    expect(chooseAiAetherCommand(input([tower({ cooldownUntil: 2000 }), enemy()]))).toBeUndefined();
    expect(chooseAiAetherCommand(input([tower({ siphon: { targetX: 12, targetY: 10 } }), enemy()]))).toBeUndefined();
    const data = input([tower(), enemy()]);
    data.tacticalView!.dormantObservatoryKeys = ["10,10"];
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
  it("avoids a known shield and can act when the shield is cooling down", () => {
    const defender = tile(13, { ownerId: "enemy", ownershipState: "SETTLED", observatory: { ownerId: "enemy", status: "active" } });
    expect(chooseAiAetherCommand(input([tower(), enemy(), defender]))).toBeUndefined();
    defender.observatory = { ownerId: "enemy", status: "active", cooldownUntil: 2000 };
    expect(chooseAiAetherCommand(input([tower(), enemy(), defender]))?.command?.type).toBe("AETHER_LANCE");
  });
  it("prioritizes siphoning FOOD when it can resolve a real slot deficit", () => {
    const food = tile(12, { ownerId: "enemy", ownershipState: "SETTLED", resource: "FARM" });
    expect(chooseAiAetherCommand(input([tower(), food], { techIds: ["crystal-lattices", "logistics"], slotDemandByResource: { FOOD: 20 } }))?.command?.type).toBe("SIPHON_TILE");
  });
  it("EMP targets a working power source and does not waste a cast on one already disabled", () => {
    const power = tile(12, { ownerId: "enemy", ownershipState: "SETTLED", economicStructure: { ownerId: "enemy", type: "AMBARIC_TRANSFORMER", status: "active" } });
    const data = input([tower(), power], { techIds: ["cryptography"] });
    expect(chooseAiAetherCommand(data)?.command?.type).toBe("AETHER_EMP");
    power.economicStructure = { ...power.economicStructure, disabledUntil: 5000 };
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
  it("builds a tower on a legal open garrison with sufficient CRYSTAL capacity", () => {
    const open = tile(10, { ownerId: "ai-1", ownershipState: "SETTLED" });
    expect(chooseAiAetherCommand(input([open, enemy()]))?.command?.type).toBe("BUILD_OBSERVATORY");
    expect(chooseAiAetherCommand(input([open, enemy()], { slotSupplyByResource: { FOOD: 10, CRYSTAL: 0 } }))).toBeUndefined();
    expect(chooseAiAetherCommand(input([open, enemy()], { activeDevelopmentProcessCount: 10 }))).toBeUndefined();
    expect(chooseAiAetherCommand(input([open, enemy()], { slotDemandByResource: { FOOD: 20 } }))).toBeUndefined();
  });
  it("bridges a known sea gap to a valuable neutral landing, skipping existing bridges", () => {
    const tiles = [tower(), tile(11, { terrain: "SEA" }), tile(12, { terrain: "SEA" }), tile(13, { town: { populationTier: "TOWN" } })];
    const data = input(tiles, { techIds: ["navigation"] });
    expect(chooseAiAetherCommand(data)?.command?.type).toBe("CAST_AETHER_BRIDGE");
    data.tacticalView!.bridgeLandingKeys = ["13,10"];
    expect(chooseAiAetherCommand(data)).toBeUndefined();
    data.tacticalView!.bridgeLandingKeys = [];
    data.tacticalView!.visibleTileKeys = ["10,10", "11,10", "13,10"];
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
  it("opens a known one-tile mountain barrier leading to a resource", () => {
    const tiles = [tower(), tile(11, { terrain: "MOUNTAIN" }), tile(12, { resource: "FARM" })];
    expect(chooseAiAetherCommand(input(tiles, { techIds: ["terrain-engineering"] }))?.command?.type).toBe("REMOVE_MOUNTAIN");
  });
  it("walls a threatened capital when manpower is depleted, without repeating an existing wall", () => {
    const own = { ...tower(), town: { populationTier: "TOWN" as const } };
    const threat = tile(11, { ownerId: "enemy", ownershipState: "SETTLED", muster: { ownerId: "enemy", amount: 100 } });
    const data = input([own, threat], { techIds: ["harborcraft"], manpower: 0 });
    expect(chooseAiAetherCommand(data)?.command).toMatchObject({ type: "CAST_AETHER_WALL", payloadJson: JSON.stringify({ x: 10, y: 10, direction: "E", length: 1 }) });
    data.tacticalView!.wallEdges = ["10,10:E"];
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
  it("uses emergency terrain defense only against an exposed hostile muster", () => {
    const capital = { ...tower(), town: { populationTier: "TOWN" as const } };
    const threat = tile(11, { ownerId: "enemy", ownershipState: "SETTLED", muster: { ownerId: "enemy", amount: 100 } });
    const data = input([capital, threat], { techIds: ["terrain-engineering"], manpower: 0 });
    expect(chooseAiAetherCommand(data)?.command?.type).toBe("CREATE_MOUNTAIN");
    data.nonHostilePlayerIds = new Set(["enemy"]);
    expect(chooseAiAetherCommand(data)).toBeUndefined();
    data.nonHostilePlayerIds = new Set();
    threat.resource = "FARM";
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
  it("does not spend a survey cast when results cannot be consumed", () => {
    const data = input([tower()], { techIds: ["beacon-towers"], frontierTiles: [tile(9)] });
    expect(chooseAiAetherCommand(data)).toBeUndefined();
    data.canConsumeSurveyResults = true;
    expect(chooseAiAetherCommand(data)?.command?.type).toBe("SURVEY_SWEEP");
  });
  it("cancels an existing siphon when its victim becomes a friend", () => {
    const data = input([tower({ siphon: { targetX: 12, targetY: 10 } }), enemy()], { nonHostilePlayerIds: new Set(["enemy"]) });
    expect(chooseAiAetherCommand(data)?.command?.type).toBe("CANCEL_SIPHON");
  });
  it("does not burn a tower cooldown purging worthless empty frontier", () => {
    expect(chooseAiAetherCommand(input([tower(), tile(12, { ownerId: "enemy", ownershipState: "FRONTIER" })]))).toBeUndefined();
  });
  it("backs off only the rejected concrete action", () => {
    const data = input([tower(), enemy()], { blockedActionKeys: new Map([["AETHER_LANCE:12,10", "AETHER_LANCE_INVALID"]]) });
    expect(chooseAiAetherCommand(data)).toBeUndefined();
  });
});

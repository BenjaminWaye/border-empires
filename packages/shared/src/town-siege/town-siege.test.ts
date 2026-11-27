import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "../config.js";
import { buildFrontierCombatPreview } from "../frontier-combat/frontier-combat.js";
import { combatSideIsBesieged, isTownBesieged, TOWN_BESIEGED_DEFENSE_MULT, TOWN_BESIEGED_LABEL, type TownSiegeTileFacts } from "./town-siege.js";

const OWNER = "owner";
const RIVAL = "rival";

const ring = (town: { x: number; y: number }, plot: (dx: number, dy: number) => TownSiegeTileFacts | undefined) => {
  const tiles = new Map<string, TownSiegeTileFacts>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const facts = plot(dx, dy);
      const x = (((town.x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      if (facts) tiles.set(`${x},${town.y + dy}`, facts);
    }
  }
  return (x: number, y: number) => tiles.get(`${x},${y}`);
};

const town = { x: 10, y: 10, terrain: "LAND", ownerId: OWNER, ownershipState: "SETTLED" };
const ALLY = "ally";
const rivalFrontier: TownSiegeTileFacts = { terrain: "LAND", ownerId: RIVAL, ownershipState: "FRONTIER" };
const allyGarrison: TownSiegeTileFacts = { terrain: "LAND", ownerId: ALLY, ownershipState: "SETTLED" };
// The owner's alliances: ALLY is allied, RIVAL is not.
const notAlly = (id: string) => id !== ALLY;

describe("isTownBesieged", () => {
  it("is besieged when rivals hold the ring and the owner garrisons none of it", () => {
    expect(isTownBesieged(town, ring(town, () => rivalFrontier), notAlly)).toBe(true);
    // The owner's ungarrisoned frontier on the ring doesn't lift the siege.
    expect(isTownBesieged(town, ring(town, (dx) => (dx === 1 ? { terrain: "LAND", ownerId: OWNER, ownershipState: "FRONTIER" } : rivalFrontier)), notAlly)).toBe(true);
  });

  it("is not besieged while the owner garrisons one plot", () => {
    expect(isTownBesieged(town, ring(town, (dx, dy) => (dx === 1 && dy === 1 ? { terrain: "LAND", ownerId: OWNER, ownershipState: "SETTLED" } : rivalFrontier)), notAlly)).toBe(false);
  });

  it("is not a siege when no rival is on the ring (an ungarrisoned or neutral ring)", () => {
    expect(isTownBesieged(town, ring(town, () => ({ terrain: "LAND", ownerId: OWNER, ownershipState: "FRONTIER" })), notAlly)).toBe(false);
    expect(isTownBesieged(town, ring(town, () => ({ terrain: "LAND" })), notAlly)).toBe(false);
  });

  it("is not besieged by a ring held only by the owner's allies", () => {
    expect(isTownBesieged(town, ring(town, () => allyGarrison), notAlly)).toBe(false);
  });

  it("is besieged by allies plus one non-allied rival when the owner garrisons none of it", () => {
    expect(isTownBesieged(town, ring(town, (dx, dy) => (dx === 1 && dy === 1 ? rivalFrontier : allyGarrison)), notAlly)).toBe(true);
  });

  it("ignores water and needs a garrisoned town", () => {
    expect(isTownBesieged(town, ring(town, (dx) => (dx === 0 ? rivalFrontier : { terrain: "SEA", ownerId: OWNER, ownershipState: "SETTLED" })), notAlly)).toBe(true);
    expect(isTownBesieged({ ...town, ownershipState: "FRONTIER" }, ring(town, () => rivalFrontier), notAlly)).toBe(false);
  });

  it("wraps around the map edge", () => {
    const edgeTown = { ...town, x: 0 };
    const keepsWrappedPlot = ring(edgeTown, (dx, dy) => (dx === -1 && dy === 0 ? { terrain: "LAND", ownerId: OWNER, ownershipState: "SETTLED" } : rivalFrontier));
    expect(isTownBesieged(edgeTown, keepsWrappedPlot, notAlly)).toBe(false);
  });
});

describe("buildFrontierCombatPreview -- siege term", () => {
  const target = { terrain: "LAND", ownershipState: "SETTLED", townType: "MARKET" };

  it("multiplies a besieged town's defense and labels the row", () => {
    const supplied = buildFrontierCombatPreview(target);
    const besieged = buildFrontierCombatPreview({ ...target, townBesieged: true });
    expect(besieged.defMult).toBeCloseTo(supplied.defMult * TOWN_BESIEGED_DEFENSE_MULT, 9);
    expect(besieged.winChance).toBeGreaterThan(supplied.winChance);
    expect(combatSideIsBesieged(besieged.defender)).toBe(true);
    expect(besieged.defender.battle.find((e) => e.label === TOWN_BESIEGED_LABEL)?.mult).toBe(TOWN_BESIEGED_DEFENSE_MULT);
    expect(combatSideIsBesieged(supplied.defender)).toBe(false);
  });

  it("never applies to a tile without a town", () => {
    const plain = buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "SETTLED", townBesieged: true });
    expect(combatSideIsBesieged(plain.defender)).toBe(false);
  });
});

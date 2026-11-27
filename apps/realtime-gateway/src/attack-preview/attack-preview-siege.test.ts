import { describe, expect, it } from "vitest";
import { combatSideIsBesieged, TOWN_BESIEGED_DEFENSE_MULT } from "@border-empires/shared";
import type { AfcCombatFacts } from "@border-empires/sim-protocol";
import { attackPreviewResult } from "./attack-preview.js";

// The preview's siege term (town-siege.ts) must match the sim's roll: the sim's
// own answer (defender combat summary) wins over the requester's partial view.
const message = { fromX: 4, fromY: 5, toX: 5, toY: 5 };
const townTile = { x: 5, y: 5, terrain: "LAND", ownerId: "e", ownershipState: "SETTLED", townType: "MARKET" };
// Every visible plot around the town is the attacker's frontier.
const ringedTiles = [
  townTile,
  ...[-1, 0, 1].flatMap((dy) => [-1, 0, 1].filter((dx) => dx !== 0 || dy !== 0).map((dx) => ({ x: 5 + dx, y: 5 + dy, terrain: "LAND", ownerId: "p", ownershipState: dx === -1 && dy === 0 ? "SETTLED" : "FRONTIER" })))
];
const facts = (besieged: boolean | undefined): AfcCombatFacts => ({ factoryEquivalents: { titanium: 0, umbrite: 0 }, ...(besieged === undefined ? {} : { targetTownBesieged: besieged }) });
const preview = (besieged: boolean | undefined) =>
  attackPreviewResult("p", ringedTiles, undefined, message, [], [], undefined, undefined, async (id) => (id === "e" ? facts(besieged) : facts(undefined)));

describe("attack preview -- besieged towns", () => {
  it("applies the sim's siege verdict and labels the defender row", async () => {
    const besieged = await preview(true);
    const supplied = await preview(false);
    expect(combatSideIsBesieged(besieged.defender as never)).toBe(true);
    expect(combatSideIsBesieged(supplied.defender as never)).toBe(false);
    expect(Number(besieged.defMult)).toBeCloseTo(Number(supplied.defMult) * TOWN_BESIEGED_DEFENSE_MULT, 9);
    expect(Number(besieged.winChance)).toBeGreaterThan(Number(supplied.winChance));
  });

  it("falls back to the visible tiles when the sim gives no verdict", async () => {
    expect(combatSideIsBesieged((await preview(undefined)).defender as never)).toBe(true);
  });
});

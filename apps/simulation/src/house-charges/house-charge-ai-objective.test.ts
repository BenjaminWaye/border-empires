import { describe, expect, it } from "vitest";
import { houseChargeExpansionObjective } from "./house-charge-ai-objective.js";
import { houseChargesWorldFor } from "./house-charges-world.js";
import { HARROWMERE, VELL, buildChargeWorld, garrisonKeys } from "./house-charges.test-helpers.js";

const charter = {
  id: "CHARTER:x",
  kind: "CHARTER" as const,
  targets: [{ key: `town:${VELL}`, name: "Vell", x: 8, y: 15 }, { key: `town:${HARROWMERE}`, name: "Harrowmere", x: 30, y: 20 }],
  searchCircle: { x: 19, y: 17, radius: 14 },
  rarity: "COMMON" as const,
  renown: 2
};
const seat = { ...charter, id: "SEAT:x", kind: "SEAT" as const, targets: [{ key: `town:${HARROWMERE}`, name: "Harrowmere", x: 30, y: 20 }] };

describe("AI House Charge objective", () => {
  it("heads for the first unfinished kept charge's target the House does not hold yet", () => {
    const tiles = buildChargeWorld();
    const player = { id: "ai-1", houseCharges: { dealtAt: 0, offered: [charter, seat], keptIds: [charter.id, seat.id] } };
    expect(houseChargeExpansionObjective(player, tiles)).toEqual({ x: 8, y: 15, kind: "neutral_value" });
    garrisonKeys(tiles, "ai-1", [VELL]);
    expect(houseChargeExpansionObjective(player, tiles)).toEqual({ x: 30, y: 20, kind: "neutral_value" });
  });

  it("treats a rival-held target as an enemy objective and skips complete charges", () => {
    const tiles = buildChargeWorld();
    garrisonKeys(tiles, "rival", [HARROWMERE]);
    const player = { id: "ai-1", houseCharges: { dealtAt: 0, offered: [charter, seat], keptIds: [charter.id, seat.id], completeSince: { [charter.id]: 5 } } };
    expect(houseChargeExpansionObjective(player, tiles)).toEqual({ x: 30, y: 20, kind: "enemy" });
    expect(houseChargeExpansionObjective({ id: "ai-1" }, tiles)).toBeUndefined();
  });

  it("aims a Charter whose towns are both held at the gap between them", () => {
    const tiles = buildChargeWorld();
    garrisonKeys(tiles, "ai-1", [VELL, HARROWMERE]);
    const player = { id: "ai-1", houseCharges: { dealtAt: 0, offered: [charter], keptIds: [charter.id] } };
    expect(houseChargeExpansionObjective(player, tiles)).toEqual({ x: 19, y: 18, kind: "neutral_value" });
  });

  it("aims an area charge at an unheld LAND tile of the area, never water", () => {
    const tiles = buildChargeWorld();
    const world = houseChargesWorldFor(tiles);
    const region = [...world.regions.byId.values()][0]!;
    const target = { key: `region:${region.id}`, name: "The Waste", x: region.centre.x, y: region.centre.y };
    const desert = { ...charter, id: "DESERT:x", kind: "DESERT" as const, targets: [target] };
    const player = { id: "ai-1", houseCharges: { dealtAt: 0, offered: [desert], keptIds: [desert.id] } };
    const objective = houseChargeExpansionObjective(player, tiles)!;
    expect(tiles.get(`${objective.x},${objective.y}`)?.terrain).toBe("LAND");
    expect([...region.cells]).toContain(objective.x + objective.y * world.width);
  });
});

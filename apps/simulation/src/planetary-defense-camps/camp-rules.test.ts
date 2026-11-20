import { describe, expect, it } from "vitest";
import { MAX_PLANETARY_DEFENSE_CAMPS } from "@border-empires/shared";
import { foundsCamp, isPlanetaryDefenseCampTile, planetaryDefenseCaptureFields, releasedPlanetaryDefenseTile } from "./camp-rules.js";

const town = { type: "FARMING" as const, populationTier: "TOWN" as const };

describe("Planetary Defense camp rules", () => {
  it("plain ground taken by a camp becomes that camp's frontier", () => {
    expect(planetaryDefenseCaptureFields({ targetKey: "5,5", previousTarget: {}, sourceCampId: "4,4", campCount: 3 })).toEqual({
      ownershipState: "FRONTIER",
      campId: "4,4"
    });
  });

  it("a town or a dock founds a new camp, and nothing else does", () => {
    expect(planetaryDefenseCaptureFields({ targetKey: "5,5", previousTarget: { town }, sourceCampId: "4,4", campCount: 3 })).toEqual({
      ownershipState: "SETTLED",
      campId: "5,5"
    });
    expect(planetaryDefenseCaptureFields({ targetKey: "5,5", previousTarget: { dockId: "d1" }, sourceCampId: "4,4", campCount: 3 })).toEqual({
      ownershipState: "SETTLED",
      campId: "5,5"
    });
    expect(foundsCamp({})).toBe(false);
  });

  it("at the camp cap a town or dock is only frontier", () => {
    expect(
      planetaryDefenseCaptureFields({ targetKey: "5,5", previousTarget: { town }, sourceCampId: "4,4", campCount: MAX_PLANETARY_DEFENSE_CAMPS })
    ).toEqual({ ownershipState: "FRONTIER", campId: "4,4" });
  });

  it("a camp tile is a SETTLED Planetary Defense tile that is its own camp", () => {
    expect(isPlanetaryDefenseCampTile("5,5", { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "5,5" })).toBe(true);
    expect(isPlanetaryDefenseCampTile("5,5", { ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "5,5" })).toBe(false);
    expect(isPlanetaryDefenseCampTile("5,5", { ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "4,4" })).toBe(false);
    expect(isPlanetaryDefenseCampTile("5,5", { ownerId: "player-1", ownershipState: "SETTLED", campId: "5,5" })).toBe(false);
  });

  it("releasing a camp tile keeps world features and drops owner, state and camp", () => {
    const released = releasedPlanetaryDefenseTile({
      x: 5,
      y: 5,
      terrain: "LAND",
      resource: "FARM",
      town,
      ownerId: "barbarian-1",
      ownershipState: "SETTLED",
      campId: "5,5"
    });
    expect(released).toEqual({ x: 5, y: 5, terrain: "LAND", resource: "FARM", town });
  });
});

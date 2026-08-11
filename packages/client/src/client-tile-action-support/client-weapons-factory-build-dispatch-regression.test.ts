import { describe, expect, it } from "vitest";
import { requiredTechForTileAction, structureTypeForTileAction } from "./client-tile-action-support.js";

// Regression: structureTypeForTileAction's switch never got cases added for
// the two Weapons Factories when they replaced WEAPONS_WORKSHOP. Every other
// build action id maps to a BuildableStructureType here, but these two fell
// through to `undefined` — and client-action-flow.ts only calls
// handleBuildAction when structureTypeForTileAction returns something
// truthy, so clicking either build button silently did nothing: no
// optimistic build, no message sent to the server, no error surfaced.
//
// Follow-up investigation (same class of bug) turned up three more build
// actions with the identical gap: build_quartermasters_office,
// build_assembly_works, and build_logistics_guild are all genuinely emitted
// by client-tile-action-logic.ts (gated on field-logistics /
// conveyor-networks / remade-concordat respectively) but were never added to
// this switch either, so those three build buttons were silently broken too.
describe("Weapons Factory build action dispatch", () => {
  it("maps both Weapons Factory build actions to their structure type", () => {
    expect(structureTypeForTileAction("build_titanium_weapons_factory")).toBe("TITANIUM_WEAPONS_FACTORY");
    expect(structureTypeForTileAction("build_umbrite_weapons_factory")).toBe("UMBRITE_WEAPONS_FACTORY");
  });

  it("gates each Weapons Factory on its own unlock tech", () => {
    expect(requiredTechForTileAction("build_titanium_weapons_factory")).toBe("masonry");
    expect(requiredTechForTileAction("build_umbrite_weapons_factory")).toBe("leatherworking");
  });
});

describe("Manpower-branch build action dispatch (Quartermaster's Office / Assembly Works / Logistics Guild)", () => {
  it("maps all three build actions to their structure type", () => {
    expect(structureTypeForTileAction("build_quartermasters_office")).toBe("QUARTERMASTERS_OFFICE");
    expect(structureTypeForTileAction("build_assembly_works")).toBe("ASSEMBLY_WORKS");
    expect(structureTypeForTileAction("build_logistics_guild")).toBe("LOGISTICS_GUILD");
  });

  it("gates each on its own unlock tech", () => {
    expect(requiredTechForTileAction("build_quartermasters_office")).toBe("field-logistics");
    expect(requiredTechForTileAction("build_assembly_works")).toBe("conveyor-networks");
    expect(requiredTechForTileAction("build_logistics_guild")).toBe("remade-concordat");
  });
});

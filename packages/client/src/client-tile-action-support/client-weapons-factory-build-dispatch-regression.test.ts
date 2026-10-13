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
// Follow-up investigation (same class of bug) turned up more build actions
// with the identical gap: build_quartermasters_office, build_reserve_lattice,
// and build_ancillary_factory were all genuinely emitted by
// client-tile-action-logic.ts (gated on field-logistics / conveyor-networks
// / remade-concordat respectively) but were never added to this switch
// either, so those three build buttons were silently broken too.
// (build_quartermasters_office itself was later retired — see
// structure-registry-economic.ts — so only Reserve Lattice and Logistics
// Guild remain below; QUARTERMASTERS_OFFICE stays a legacy structure type,
// but nothing emits its build action anymore.)
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

describe("Manpower-branch build action dispatch (Reserve Lattice / Ancillary Factory)", () => {
  it("maps both build actions to their structure type", () => {
    expect(structureTypeForTileAction("build_reserve_lattice")).toBe("RESERVE_LATTICE");
    expect(structureTypeForTileAction("build_ancillary_factory")).toBe("ANCILLARY_FACTORY");
  });

  it("gates each on its own unlock tech", () => {
    expect(requiredTechForTileAction("build_reserve_lattice")).toBe("conveyor-networks");
    expect(requiredTechForTileAction("build_ancillary_factory")).toBe("remade-concordat");
  });
});

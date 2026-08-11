import { describe, expect, it } from "vitest";
import { requiredTechForTileAction, structureTypeForTileAction } from "./client-tile-action-support.js";

// Regression: structureTypeForTileAction's switch never got cases added for
// the two Weapons Factories when they replaced WEAPONS_WORKSHOP. Every other
// build action id maps to a BuildableStructureType here, but these two fell
// through to `undefined` — and client-action-flow.ts only calls
// handleBuildAction when structureTypeForTileAction returns something
// truthy, so clicking either build button silently did nothing: no
// optimistic build, no message sent to the server, no error surfaced.
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

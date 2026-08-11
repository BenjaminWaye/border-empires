import { describe, expect, it } from "vitest";
import { economicStructureName } from "./client-map-display.js";

// Phase 8 (docs/plans/2026-08-06-converter-mode-flip.md, Phase 6/8): the
// converter buildings now run either direction, so their display names must
// be direction-neutral. The persisted type constants are unchanged — this is
// a copy-only change (§Phase 6 item 1). Guards against a future "helpful"
// rename of the identifiers themselves.
describe("economicStructureName — converter-mode-flip naming", () => {
  it("returns direction-neutral names for the Umbrite/Titanium converter family", () => {
    expect(economicStructureName("UMBRITE_SYNTHESIZER")).toBe("Umbrite Works");
    expect(economicStructureName("ADVANCED_UMBRITE_SYNTHESIZER")).toBe("Advanced Umbrite Works");
    expect(economicStructureName("TITANIUM_WORKS")).toBe("Titanium Works");
    expect(economicStructureName("ADVANCED_TITANIUM_WORKS")).toBe("Advanced Titanium Works");
  });

  it("leaves the already direction-neutral Aether Condenser name unchanged", () => {
    expect(economicStructureName("CRYSTAL_SYNTHESIZER")).toBe("Aether Condenser");
    expect(economicStructureName("ADVANCED_CRYSTAL_SYNTHESIZER")).toBe("Advanced Aether Condenser");
  });
});

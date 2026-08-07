import { describe, expect, it } from "vitest";
import { economicStructureName } from "./client-map-display.js";

// Phase 8 (docs/plans/2026-08-06-converter-mode-flip.md, Phase 6/8): the
// converter buildings now run either direction, so their display names must
// be direction-neutral. The persisted type constants are unchanged — this is
// a copy-only change (§Phase 6 item 1). Guards against a future "helpful"
// rename of the identifiers themselves.
describe("economicStructureName — converter-mode-flip naming", () => {
  it("returns direction-neutral names for the Fur/Iron converter family", () => {
    expect(economicStructureName("FUR_SYNTHESIZER")).toBe("Fur Works");
    expect(economicStructureName("ADVANCED_FUR_SYNTHESIZER")).toBe("Advanced Fur Works");
    expect(economicStructureName("IRONWORKS")).toBe("Iron Works");
    expect(economicStructureName("ADVANCED_IRONWORKS")).toBe("Advanced Iron Works");
  });

  it("leaves the already direction-neutral Aether Condenser name unchanged", () => {
    expect(economicStructureName("CRYSTAL_SYNTHESIZER")).toBe("Aether Condenser");
    expect(economicStructureName("ADVANCED_CRYSTAL_SYNTHESIZER")).toBe("Advanced Aether Condenser");
  });
});

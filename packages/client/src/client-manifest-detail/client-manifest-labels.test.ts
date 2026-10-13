import { describe, expect, it } from "vitest";
import { manifestFlavorLine, manifestKicker, manifestTypeLabel } from "./client-manifest-labels.js";

describe("Manifest labels", () => {
  it("labels each Manifest by its type", () => {
    expect(manifestTypeLabel({ manifestCategory: "AFC_MODULE", name: "Hive Mind Module II" })).toBe("AFC Module");
    expect(manifestTypeLabel({ manifestCategory: "DOSSIER", name: "Aegis Dome Dossier" })).toBe("Dossier");
    expect(manifestTypeLabel({ manifestCategory: "CREW_OFFICE_CONSIGNMENT", name: "Prospector Crew" })).toBe("Crew");
    expect(manifestTypeLabel({ manifestCategory: "CREW_OFFICE_CONSIGNMENT", name: "Census Office" })).toBe("Office");
    expect(manifestTypeLabel({ manifestCategory: "CHARTER_WARRANT", name: "Trade Clearance Grant" })).toBe("Grant");
    expect(manifestTypeLabel({ manifestCategory: "CHARTER_WARRANT", name: "Tuned Separation Process" })).toBe("Process");
  });

  it("builds a kicker from type, branch and tier", () => {
    expect(manifestKicker({ manifestCategory: "AFC_MODULE", name: "Titanium Forge Module", branch: "war" }, 1)).toBe("AFC Module · War · Tier 1");
  });

  it("keeps only the first sentence as flavor", () => {
    expect(manifestFlavorLine("Imported crop stock. Unlocks the Hydrogarden.")).toBe("Imported crop stock.");
    expect(manifestFlavorLine("No full stop")).toBe("No full stop");
  });
});

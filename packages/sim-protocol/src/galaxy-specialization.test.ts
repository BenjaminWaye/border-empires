import { describe, expect, it } from "vitest";

import { GALAXY_SPECIALIZATION_NAME, specializationForVictoryPath } from "./galaxy-specialization.js";
import type { SeasonVictoryPathId } from "@border-empires/shared";

describe("specializationForVictoryPath", () => {
  it("maps every victory path to its documented specialization (docs/galactic-campaign-design.md §3)", () => {
    const expected: Record<SeasonVictoryPathId, string> = {
      TOWN_CONTROL: "INDUSTRIAL",
      ECONOMIC_HEGEMONY: "TRADE",
      RESOURCE_MONOPOLY: "EXTRACTION",
      MARITIME_SUPREMACY: "LOGISTICS",
      DIPLOMATIC_DOMINANCE: "CAPITAL"
    };
    for (const [objectiveId, specialization] of Object.entries(expected)) {
      expect(specializationForVictoryPath(objectiveId as SeasonVictoryPathId)).toBe(specialization);
    }
  });

  it("has a display name for every specialization the mapping can produce", () => {
    const objectiveIds: SeasonVictoryPathId[] = [
      "TOWN_CONTROL",
      "ECONOMIC_HEGEMONY",
      "RESOURCE_MONOPOLY",
      "MARITIME_SUPREMACY",
      "DIPLOMATIC_DOMINANCE"
    ];
    for (const objectiveId of objectiveIds) {
      const specialization = specializationForVictoryPath(objectiveId);
      expect(GALAXY_SPECIALIZATION_NAME[specialization]).toBeTruthy();
    }
  });
});

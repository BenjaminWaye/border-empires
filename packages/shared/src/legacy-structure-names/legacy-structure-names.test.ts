import { describe, expect, it } from "vitest";

import {
  upgradeLegacyStructureNames,
  upgradeLegacyStructureNamesInJson,
  upgradeLegacyStructureToken
} from "./legacy-structure-names.js";

describe("upgradeLegacyStructureToken", () => {
  it("upgrades old structure ids in every identifier style", () => {
    expect(upgradeLegacyStructureToken("TRADE_NEXUS")).toBe("TRADE_NEXUS");
    expect(upgradeLegacyStructureToken("AMBARIC_TRANSFORMER")).toBe("AMBARIC_TRANSFORMER");
    expect(upgradeLegacyStructureToken("HIGH_YIELD_AETHER_CONDENSER")).toBe("HIGH_YIELD_AETHER_CONDENSER");
    expect(upgradeLegacyStructureToken("SOVEREIGN_SIEGE_ENGINE_PART_2")).toBe("SOVEREIGN_SIEGE_ENGINE_PART_2");
    expect(upgradeLegacyStructureToken("BUILD_SIEGE_BATTERY")).toBe("BUILD_SIEGE_BATTERY");
    expect(upgradeLegacyStructureToken("SKY_DOCK_BOMBARD")).toBe("SKY_DOCK_BOMBARD");
    expect(upgradeLegacyStructureToken("siegeBattery")).toBe("siegeBattery");
    expect(upgradeLegacyStructureToken("hasIncubationEngine")).toBe("hasIncubationEngine");
    expect(upgradeLegacyStructureToken("build_palisade")).toBe("build_palisade");
    expect(upgradeLegacyStructureToken("sovereign-siege-engine-strike")).toBe("sovereign-siege-engine-strike");
  });

  it("is idempotent on current names", () => {
    for (const id of ["TRADE_NEXUS", "AMBARIC_TRANSFORMER", "siegeBattery", "OBSERVATORY", "SKY_DOCK_BOMBARD"]) {
      expect(upgradeLegacyStructureToken(id)).toBe(id);
    }
  });

  it("leaves non-structure ids that share a word alone", () => {
    expect(upgradeLegacyStructureToken("world-engine")).toBe("world-engine"); // tech id
    expect(upgradeLegacyStructureToken("war-foundries")).toBe("war-foundries"); // domain id
    expect(upgradeLegacyStructureToken("FOUNDRY_HEART")).toBe("FOUNDRY_HEART"); // natural wonder
    expect(upgradeLegacyStructureToken("Incubation Engine")).toBe("Incubation Engine"); // display text, not an id
    expect(upgradeLegacyStructureToken("old incubation engine road")).toBe("old incubation engine road");
  });
});

describe("upgradeLegacyStructureNames", () => {
  it("upgrades keys and values in nested persisted state, but not free text", () => {
    const legacy = {
      tiles: [{ economicStructure: { type: "TRADE_NEXUS" }, siegeBattery: { variant: "SIEGE_BATTERY" }, fort: { variant: "PALISADE" } }],
      player: { name: "SKY_DOCK", techIds: ["world-engine"], structureHistory: ["INCUBATION_ENGINE", "FORT"] }
    };
    expect(upgradeLegacyStructureNames(legacy)).toEqual({
      tiles: [{ economicStructure: { type: "TRADE_NEXUS" }, siegeBattery: { variant: "SIEGE_BATTERY" }, fort: { variant: "PALISADE" } }],
      player: { name: "SKY_DOCK", techIds: ["world-engine"], structureHistory: ["INCUBATION_ENGINE", "FORT"] }
    });
  });

  it("upgrades JSON nested as strings inside persisted state", () => {
    const legacy = { tiles: [{ economicStructureJson: '{"type":"INCUBATION_ENGINE","status":"active"}' }], command: { payloadJson: '{"structureType":"SKY_DOCK"}' } };
    expect(upgradeLegacyStructureNames(legacy)).toEqual({
      tiles: [{ economicStructureJson: '{"type":"INCUBATION_ENGINE","status":"active"}' }],
      command: { payloadJson: '{"structureType":"SKY_DOCK"}' }
    });
  });

  it("returns the same reference when nothing changed", () => {
    const current = { tiles: [{ economicStructure: { type: "TRADE_NEXUS" } }] };
    expect(upgradeLegacyStructureNames(current)).toBe(current);
  });

  it("upgrades a JSON string and skips strings with no candidates", () => {
    expect(upgradeLegacyStructureNamesInJson('{"structureType":"ORE_REFINERY","x":1}')).toBe('{"structureType":"ORE_REFINERY","x":1}');
    const untouched = '{"structureType":"MINE"}';
    expect(upgradeLegacyStructureNamesInJson(untouched)).toBe(untouched);
  });
});

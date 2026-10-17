import { describe, expect, it } from "vitest";

import {
  upgradeLegacyStructureNames,
  upgradeLegacyStructureNamesInJson,
  upgradeLegacyStructureToken
} from "./legacy-structure-names.js";

describe("upgradeLegacyStructureToken", () => {
  it("migrates manufactories without renaming the Imperial Exchange tech", () => {
    expect(upgradeLegacyStructureToken("MINTWORKS")).toBe("MANUFACTORY");
    expect(upgradeLegacyStructureToken("build_mintworks")).toBe("build_manufactory");
    expect(upgradeLegacyStructureToken("mintworksCount")).toBe("manufactoryCount");
    expect(upgradeLegacyStructureToken("unlockMintworks")).toBe("unlockManufactory");
    expect(upgradeLegacyStructureToken("urban-mintworks")).toBe("urban-mintworks");
  });
  it("upgrades old structure ids in every identifier style", () => {
    expect(upgradeLegacyStructureToken("CARAVANARY")).toBe("TRADE_NEXUS");
    expect(upgradeLegacyStructureToken("AETHER_TOWER")).toBe("AMBARIC_TRANSFORMER");
    expect(upgradeLegacyStructureToken("ADVANCED_CRYSTAL_SYNTHESIZER")).toBe("HIGH_YIELD_AETHER_CONDENSER");
    expect(upgradeLegacyStructureToken("WORLD_ENGINE_PART_2")).toBe("SOVEREIGN_SIEGE_ENGINE_PART_2");
    expect(upgradeLegacyStructureToken("BUILD_SIEGE_OUTPOST")).toBe("BUILD_SIEGE_BATTERY");
    expect(upgradeLegacyStructureToken("AIRPORT_BOMBARD")).toBe("SKY_DOCK_BOMBARD");
    expect(upgradeLegacyStructureToken("siegeOutpost")).toBe("siegeBattery");
    expect(upgradeLegacyStructureToken("hasGranary")).toBe("hasIncubationEngine");
    expect(upgradeLegacyStructureToken("build_wooden_fort")).toBe("build_palisade");
    expect(upgradeLegacyStructureToken("world-engine-strike")).toBe("sovereign-siege-engine-strike");
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
    expect(upgradeLegacyStructureToken("Granary")).toBe("Granary"); // display text, not an id
    expect(upgradeLegacyStructureToken("old granary road")).toBe("old granary road");
  });
});

describe("upgradeLegacyStructureNames", () => {
  it("migrates saved factories, town summaries and queued builds together", () => {
    expect(upgradeLegacyStructureNames({
      economicStructure: { type: "MINTWORKS", status: "active" },
      town: { hasMintworks: true, mintworksCount: 6 },
      payloadJson: '{"structureType":"MINTWORKS"}',
      techIds: ["trade", "urban-mintworks"]
    })).toEqual({
      economicStructure: { type: "MANUFACTORY", status: "active" },
      town: { hasManufactory: true, manufactoryCount: 6 },
      payloadJson: '{"structureType":"MANUFACTORY"}',
      techIds: ["trade", "urban-mintworks"]
    });
  });
  it("upgrades keys and values in nested persisted state, but not free text", () => {
    const legacy = {
      tiles: [{ economicStructure: { type: "CARAVANARY" }, siegeOutpost: { variant: "SIEGE_OUTPOST" }, fort: { variant: "WOODEN_FORT" } }],
      player: { name: "AIRPORT", techIds: ["world-engine"], structureHistory: ["GRANARY", "FORT"] }
    };
    expect(upgradeLegacyStructureNames(legacy)).toEqual({
      tiles: [{ economicStructure: { type: "TRADE_NEXUS" }, siegeBattery: { variant: "SIEGE_BATTERY" }, fort: { variant: "PALISADE" } }],
      player: { name: "AIRPORT", techIds: ["world-engine"], structureHistory: ["INCUBATION_ENGINE", "FORT"] }
    });
  });

  it("upgrades JSON nested as strings inside persisted state", () => {
    const legacy = { tiles: [{ economicStructureJson: '{"type":"GRANARY","status":"active"}' }], command: { payloadJson: '{"structureType":"AIRPORT"}' } };
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
    expect(upgradeLegacyStructureNamesInJson('{"structureType":"FOUNDRY","x":1}')).toBe('{"structureType":"ORE_REFINERY","x":1}');
    const untouched = '{"structureType":"MINE"}';
    expect(upgradeLegacyStructureNamesInJson(untouched)).toBe(untouched);
  });
});

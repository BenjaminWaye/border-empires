import { describe, expect, test } from "vitest";
import { buildDurationWithSpeedMult, discountedStructureManpowerCost, structureBuildSpeedEffectKey, structureManpowerCostEffectKey } from "../structure-registry-index.js";

describe("structureBuildSpeedEffectKey", () => {
  test("maps each structure family to the effect the simulation applies", () => {
    expect(structureBuildSpeedEffectKey("FORT")).toBe("fortBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("THUNDER_BASTION")).toBe("fortBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("PALISADE")).toBe("fortBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("SIEGE_BATTERY")).toBe("outpostDeploymentSpeedMult");
    expect(structureBuildSpeedEffectKey("DREAD_TOWER")).toBe("outpostDeploymentSpeedMult");
    expect(structureBuildSpeedEffectKey("MANUFACTORY")).toBe("economicStructureBuildSpeedMult");
  });

  test("Relay Beacon has a dedicated speed lever; Aether Tower uses universal speed only", () => {
    expect(structureBuildSpeedEffectKey("RELAY_BEACON")).toBe("relayBeaconBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("OBSERVATORY")).toBeUndefined();
    expect(structureBuildSpeedEffectKey("NOT_A_STRUCTURE")).toBeUndefined();
  });
});

describe("buildDurationWithSpeedMult", () => {
  test("divides the base time by the multiplier", () => {
    expect(buildDurationWithSpeedMult(150_000, 1.5)).toBe(100_000);
    expect(buildDurationWithSpeedMult(150_000, 1)).toBe(150_000);
  });
});

describe("structureManpowerCostEffectKey", () => {
  test("maps every Fort tier and the Relay Beacon to their AFC discount, others to none", () => {
    expect(structureManpowerCostEffectKey("FORT")).toBe("fortBuildManpowerCostMult");
    expect(structureManpowerCostEffectKey("THUNDER_BASTION")).toBe("fortBuildManpowerCostMult");
    expect(structureManpowerCostEffectKey("PALISADE")).toBe("fortBuildManpowerCostMult");
    expect(structureManpowerCostEffectKey("RELAY_BEACON")).toBe("relayBeaconBuildManpowerCostMult");
    expect(structureManpowerCostEffectKey("SIEGE_BATTERY")).toBeUndefined();
    expect(structureManpowerCostEffectKey("MANUFACTORY")).toBeUndefined();
  });

  test("rounds a discounted cost and never goes negative", () => {
    expect(discountedStructureManpowerCost(100, 0.5)).toBe(50);
    expect(discountedStructureManpowerCost(100, 1 / 6)).toBe(17);
    expect(discountedStructureManpowerCost(0, 0.5)).toBe(0);
  });
});

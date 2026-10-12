import { describe, expect, test } from "vitest";
import { buildDurationWithSpeedMult, structureBuildSpeedEffectKey } from "../structure-registry-index.js";

describe("structureBuildSpeedEffectKey", () => {
  test("maps each structure family to the effect the simulation applies", () => {
    expect(structureBuildSpeedEffectKey("FORT")).toBe("fortBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("THUNDER_BASTION")).toBe("fortBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("WOODEN_FORT")).toBe("fortBuildSpeedMult");
    expect(structureBuildSpeedEffectKey("SIEGE_OUTPOST")).toBe("outpostDeploymentSpeedMult");
    expect(structureBuildSpeedEffectKey("DREAD_TOWER")).toBe("outpostDeploymentSpeedMult");
    expect(structureBuildSpeedEffectKey("MINTWORKS")).toBe("economicStructureBuildSpeedMult");
  });

  test("Relay Beacon and Aether Tower have no speed lever", () => {
    expect(structureBuildSpeedEffectKey("RELAY_BEACON")).toBeUndefined();
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

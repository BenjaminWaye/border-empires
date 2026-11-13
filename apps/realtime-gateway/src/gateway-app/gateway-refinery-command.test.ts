import { describe, expect, it, vi } from "vitest";
import { dispatchEconomicBuildOrRefineryCommand } from "./gateway-refinery-command.js";

describe("dispatchEconomicBuildOrRefineryCommand", () => {
  it("passes a refinery's explicit field through with BUILD_ECONOMIC_STRUCTURE, and omits it when absent", async () => {
    const dispatch = vi.fn(async () => {});
    expect(await dispatchEconomicBuildOrRefineryCommand({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "TITANIUM_REFINERY", fieldX: 4, fieldY: 5 }, dispatch)).toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith("BUILD_ECONOMIC_STRUCTURE", { x: 1, y: 2, structureType: "TITANIUM_REFINERY", fieldX: 4, fieldY: 5 });
    await dispatchEconomicBuildOrRefineryCommand({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "MANUFACTORY" }, dispatch);
    expect(dispatch).toHaveBeenLastCalledWith("BUILD_ECONOMIC_STRUCTURE", { x: 1, y: 2, structureType: "MANUFACTORY" });
  });

  it("forwards ASSIGN_REFINERY_FIELD with metadata, and ignores other messages", async () => {
    const dispatch = vi.fn(async () => {});
    expect(await dispatchEconomicBuildOrRefineryCommand({ type: "ASSIGN_REFINERY_FIELD", x: 1, y: 2, fieldX: 3, fieldY: 4 }, dispatch)).toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith("ASSIGN_REFINERY_FIELD", { x: 1, y: 2, fieldX: 3, fieldY: 4 }, true);
    expect(await dispatchEconomicBuildOrRefineryCommand({ type: "CANCEL_FORT_BUILD", x: 1, y: 2 }, dispatch)).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { dispatchGenericBuild, type BuildDispatchDeps } from "./client-structure-build-trigger.js";

describe("town support build optimism", () => {
  it("leaves auto-placed stacking buildings off the town so another copy can be ordered", () => {
    const applyOptimisticStructureBuild = vi.fn();
    const sendDevelopmentBuild: BuildDispatchDeps["sendDevelopmentBuild"] = vi.fn((_payload, optimistic) => { optimistic(); return true; });
    const deps: BuildDispatchDeps = { sendDevelopmentBuild, applyOptimisticStructureBuild, structureDisplayLabel: () => "Manufactory" };
    // Only town presence matters at this dispatch boundary.
    const town: Tile = { x: 5, y: 5, terrain: "LAND", town: { name: "Hub" } as NonNullable<Tile["town"]> };
    dispatchGenericBuild("MANUFACTORY", town, deps);
    dispatchGenericBuild("MANUFACTORY", town, deps);
    expect(sendDevelopmentBuild).toHaveBeenCalledTimes(2);
    expect(applyOptimisticStructureBuild).not.toHaveBeenCalled();
    dispatchGenericBuild("MANUFACTORY", { ...town, x: 6, town: undefined }, deps);
    expect(applyOptimisticStructureBuild).toHaveBeenCalledWith(6, 5, "MANUFACTORY");
  });
});

import { describe, expect, it } from "vitest";
import { activeAfcModuleTechIds, hasInstalledAiBuildModule } from "./ai-build-unlocks.js";
import { canAffordStructure } from "./structure-command-planner.js";
import { TECH_REQUIREMENTS_BY_STRUCTURE } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

describe("AI installed AFC build modules", () => {
  it("reads only the supplied owned, settled active AFC index", () => {
    const tile = (x: number, ownerId = "ai-1", status: "active" | "inactive" = "active"): DomainTileState => ({ x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED", afc: { ownerId, status, modules: ["crystal-lattices"] } });
    const tiles = new Map([["0,0", tile(0)], ["1,0", tile(1, "enemy")], ["2,0", tile(2, "ai-1", "inactive")]]);
    expect(activeAfcModuleTechIds("ai-1", ["1,0", "2,0"], tiles)).toEqual([]);
    expect(activeAfcModuleTechIds("ai-1", tiles.keys(), tiles)).toEqual(["crystal-lattices"]);
    tiles.get("0,0")!.afc!.ownerId = "enemy";
    expect(activeAfcModuleTechIds("ai-1", tiles.keys(), tiles)).toEqual([]);
  });
  it("does not confuse research with an installed module", () => {
    expect(hasInstalledAiBuildModule([], "crystal-lattices")).toBe(false);
    expect(hasInstalledAiBuildModule(["crystal-lattices"], "crystal-lattices")).toBe(true);
  });
  it("keeps recipe structures available and gates module structures", () => {
    const player = { id: "ai-1", points: 100000, manpower: 100000, installedModuleTechIds: [] as string[] };
    const techs = new Set(Object.values(TECH_REQUIREMENTS_BY_STRUCTURE));
    expect(canAffordStructure(player, techs, "HYDROGARDEN", 0)).toBe(true);
    expect(canAffordStructure(player, techs, "SKY_DOCK", 0)).toBe(false);
    player.installedModuleTechIds.push(TECH_REQUIREMENTS_BY_STRUCTURE.SKY_DOCK);
    expect(canAffordStructure(player, techs, "SKY_DOCK", 0)).toBe(true);
  });
});

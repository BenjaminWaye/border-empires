import { describe, expect, it } from "vitest";
import techTree from "../../data/tech-tree.json" with { type: "json" };
import { structureCostDefinition, structureSlotRequirements, TECH_REQUIREMENTS_BY_STRUCTURE } from "@border-empires/shared";

describe("Manufactory Manifest compatibility", () => {
  it("keeps the existing unlock and assigns its reusable tooling capability to an AFC module", () => {
    const tooling = techTree.techs.find((tech) => tech.id === "trade");
    expect(tooling).toMatchObject({
      name: "Industrial Tooling Module",
      manifestCategory: "AFC_MODULE",
      effects: { unlockManufactory: true }
    });
    expect(TECH_REQUIREMENTS_BY_STRUCTURE.MANUFACTORY).toBe("trade");
    expect(structureCostDefinition("MANUFACTORY")).toMatchObject({ baseGoldCost: 0, manpowerCost: 150 });
    expect(structureSlotRequirements("MANUFACTORY")).toEqual([{ resource: "FOOD", count: 1 }]);
    expect(techTree.techs.find((tech) => tech.id === "urban-mintworks")?.name).toBe("Imperial Exchange Dossier");
  });
});

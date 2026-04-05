import { describe, expect, it } from "vitest";

import { assignMissingTownNames, cultureIdForIsland } from "./town-names.js";

describe("assignMissingTownNames", () => {
  it("keeps town names unique within an island and preserves existing names", () => {
    const towns = [
      { townId: "town-1", tileKey: "10,10" as const, name: "Old Brassgate" },
      { townId: "town-2", tileKey: "12,10" as const },
      { townId: "town-3", tileKey: "16,10" as const }
    ];
    const islandIdByTile = new Map([
      ["10,10" as const, 4],
      ["12,10" as const, 4],
      ["16,10" as const, 4]
    ]);

    assignMissingTownNames(towns, islandIdByTile, 73125);

    expect(towns[0]?.name).toBe("Old Brassgate");
    const generated = towns.slice(1).map((town) => town.name);
    expect(generated.every((name) => typeof name === "string" && name.length > 3)).toBe(true);
    expect(new Set(towns.map((town) => town.name)).size).toBe(towns.length);
  });

  it("reuses one culture per island while staying diverse across islands", () => {
    expect(cultureIdForIsland(90210, 12)).toBe(cultureIdForIsland(90210, 12));
    const cultureIds = new Set([0, 1, 2, 3, 4, 5].map((islandId) => cultureIdForIsland(90210, islandId)));
    expect(cultureIds.size).toBeGreaterThan(1);
  });
});

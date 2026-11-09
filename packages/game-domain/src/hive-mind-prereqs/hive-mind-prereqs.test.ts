import { describe, expect, it } from "vitest";
import techTree from "../../data/tech-tree.json" with { type: "json" };

describe("Hive Mind manifest chain", () => {
  it("unlocks Hive Mind Module II from Thunderplate Induction, leaving Hive Mind Module I a dead end", () => {
    const hiveMindII = techTree.techs.find((tech) => tech.id === "muster-command");
    expect(hiveMindII?.name).toBe("Hive Mind Module II");
    expect(hiveMindII?.prereqIds).toEqual(["steelworking"]);
    expect(techTree.techs.find((tech) => tech.id === "steelworking")?.name).toBe("Thunderplate Induction Module");
    const dependentsOfHiveMindI = techTree.techs.filter((tech) => (tech.prereqIds ?? []).includes("muster-discipline"));
    expect(dependentsOfHiveMindI).toEqual([]);
  });
});

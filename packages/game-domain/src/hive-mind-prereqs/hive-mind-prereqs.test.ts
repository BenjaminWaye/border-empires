import { describe, expect, it } from "vitest";
import techTree from "../../data/tech-tree.json" with { type: "json" };

const techById = (id: string) => techTree.techs.find((tech) => tech.id === id);

describe("Hive Mind manifest chain", () => {
  it("joins both War tier 3 manifests into Hive Mind Module II, leaving Hive Mind Module I a dead end", () => {
    const hiveMindII = techById("muster-command");
    expect(hiveMindII?.name).toBe("Hive Mind Module II");
    expect(hiveMindII?.prereqIds).toEqual(["standing-army", "steelworking"]);
    expect(hiveMindII?.tier).toBe(4);
    expect(techById("standing-army")?.name).toBe("Dread Tower Cadre");
    expect(techById("steelworking")?.name).toBe("Thunderplate Induction Module");
    const dependentsOfHiveMindI = techTree.techs.filter((tech) => (tech.prereqIds ?? []).includes("muster-discipline"));
    expect(dependentsOfHiveMindI).toEqual([]);
  });

  it("gates both War tier 5 dossiers on Hive Mind Module II", () => {
    for (const id of ["world-engine", "aegis-dome"]) {
      expect(techById(id)?.tier).toBe(5);
      expect(techById(id)?.prereqIds).toEqual(["muster-command"]);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABILITY_DEFS } from "../server-game-constants/ability-defs.js";
import { playerHasAbilityTech, requiredTechIdsForAbility } from "./ability-gating.js";

type TechRecord = { id: string; tier: number; branch: string; prereqIds?: string[]; effects: Record<string, unknown> };
const techs = (JSON.parse(readFileSync(new URL("../../data/tech-tree.json", import.meta.url), "utf8")) as { techs: TechRecord[] }).techs;
const techById = new Map(techs.map((tech) => [tech.id, tech]));

// Manifest plan §7: every ability's gate is exactly one Manifest tech.
const EXPECTED: Record<keyof typeof ABILITY_DEFS, string> = {
  reveal_empire: "beacon-towers",
  reveal_empire_stats: "beacon-towers",
  survey_sweep: "beacon-towers",
  aether_lance: "crystal-lattices",
  aether_bridge: "navigation",
  aether_wall: "harborcraft",
  siphon: "logistics",
  create_mountain: "terrain-engineering",
  remove_mountain: "terrain-engineering",
  retort_recast: "matterwright-retort"
};

describe("ability gating", () => {
  it("matches the Manifest requirement for every ability", () => {
    for (const [id, techId] of Object.entries(EXPECTED)) {
      expect(requiredTechIdsForAbility(id as keyof typeof ABILITY_DEFS)).toEqual([techId]);
      expect(techById.has(techId)).toBe(true);
    }
  });

  it("Aether Purge belongs to the Aether Resonance Core", () => {
    expect(techById.get("crystal-lattices")?.effects.unlockAetherLance).toBe(true);
  });

  it("Augury Office gates Survey Sweep, Reveal Empire and Reveal Stats", () => {
    expect(playerHasAbilityTech(new Set(["crystal-lattices"]), "survey_sweep")).toBe(false);
    expect(playerHasAbilityTech(new Set(["beacon-towers"]), "survey_sweep")).toBe(true);
    expect(playerHasAbilityTech(new Set(["beacon-towers"]), "reveal_empire")).toBe(true);
    expect(playerHasAbilityTech(["beacon-towers"], "reveal_empire_stats")).toBe(true);
  });
});

describe("Aether branch layout", () => {
  const aether = techs.filter((tech) => tech.branch === "aether");
  const maxAetherTier = Math.max(...aether.map((tech) => tech.tier));
  const ancestorsOf = (id: string, seen = new Set<string>()): Set<string> => {
    for (const prereqId of techById.get(id)?.prereqIds ?? []) {
      if (seen.has(prereqId)) continue;
      seen.add(prereqId);
      ancestorsOf(prereqId, seen);
    }
    return seen;
  };

  it("puts Aether EMP at the end, behind a Manifest that unlocks the Ambaric Transformers it targets", () => {
    const emp = techById.get("cryptography");
    expect(emp?.effects.unlockAetherEmp).toBe(true);
    expect(emp?.tier).toBe(maxAetherTier);
    expect([...ancestorsOf("cryptography")].some((id) => techById.get(id)?.effects.unlockAmbaricTransformer === true)).toBe(true);
    expect(techs.some((tech) => tech.prereqIds?.includes("cryptography"))).toBe(false);
  });

  it("moves Aether Bridge into EMP's old tier-2 slot, straight off the Aether Resonance Core", () => {
    const bridge = techById.get("navigation");
    expect(bridge?.effects.unlockNavalInfiltration).toBe(true);
    expect(bridge?.tier).toBe(2);
    expect(bridge?.prereqIds).toEqual(["crystal-lattices"]);
  });

  it("puts Survey Sweep and Reveal Empire on the same Manifest", () => {
    const owners = (effect: string): string[] => techs.filter((tech) => tech.effects[effect] === true).map((tech) => tech.id);
    expect(owners("unlockSurveySweep")).toEqual(["beacon-towers"]);
    expect(owners("unlockRevealEmpire")).toEqual(["beacon-towers"]);
  });

  it("only references prerequisites that exist", () => {
    for (const tech of techs) for (const prereqId of tech.prereqIds ?? []) expect(techById.has(prereqId), `${tech.id} -> ${prereqId}`).toBe(true);
  });
});

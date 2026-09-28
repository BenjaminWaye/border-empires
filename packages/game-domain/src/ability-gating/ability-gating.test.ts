import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABILITY_DEFS } from "../server-game-constants/ability-defs.js";
import { playerHasAbilityTech, requiredTechIdsForAbility } from "./ability-gating.js";

type TechRecord = { id: string; effects: Record<string, unknown> };
const techs = (JSON.parse(readFileSync(new URL("../../data/tech-tree.json", import.meta.url), "utf8")) as { techs: TechRecord[] }).techs;
const techById = new Map(techs.map((tech) => [tech.id, tech]));

// Manifest plan §7: every ability's gate is exactly one Manifest tech.
const EXPECTED: Record<keyof typeof ABILITY_DEFS, string> = {
  reveal_empire: "beacon-towers",
  reveal_empire_stats: "beacon-towers",
  survey_sweep: "surveying",
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

  it("Augury Office gates both Reveal Empire and Reveal Stats", () => {
    expect(playerHasAbilityTech(new Set(["surveying"]), "reveal_empire_stats")).toBe(false);
    expect(playerHasAbilityTech(new Set(["beacon-towers"]), "reveal_empire")).toBe(true);
    expect(playerHasAbilityTech(["beacon-towers"], "reveal_empire_stats")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playerHasAbilityTech } from "@border-empires/game-domain";
import { migrateRetiredTechIds } from "./retired-tech-ids.js";

const liveTechIds = new Set(
  (JSON.parse(readFileSync(new URL("../../../../packages/game-domain/data/tech-tree.json", import.meta.url), "utf8")) as { techs: { id: string }[] }).techs.map((tech) => tech.id)
);

describe("migrateRetiredTechIds", () => {
  it("restores an Echo-Reader Crew owner with Augury Office, so Survey Sweep still works", () => {
    const migrated = migrateRetiredTechIds(["crystal-lattices", "surveying"]);
    expect([...migrated].sort()).toEqual(["beacon-towers", "crystal-lattices"]);
    expect(playerHasAbilityTech(migrated, "survey_sweep")).toBe(true);
  });

  it("keeps the retired id as a counted placeholder when the player already owns the replacement", () => {
    // The old tree made Augury Office require Echo-Reader Crew, so every
    // Augury Office owner has both; collapsing them would drop the owned
    // count that prices their next Manifest.
    const owned = ["crystal-lattices", "surveying", "beacon-towers"];
    const migrated = migrateRetiredTechIds(owned);
    expect(migrated.size).toBe(owned.length);
    expect([...migrated].sort()).toEqual(["beacon-towers", "crystal-lattices", "surveying"]);
    expect(playerHasAbilityTech(migrated, "survey_sweep")).toBe(true);
  });

  it("leaves live Manifest ids alone and only maps ids that left the tree onto ids still in it", () => {
    expect([...migrateRetiredTechIds(liveTechIds)].sort()).toEqual([...liveTechIds].sort());
    expect(liveTechIds.has("surveying")).toBe(false);
    expect([...migrateRetiredTechIds(["surveying"])].every((id) => liveTechIds.has(id))).toBe(true);
  });
});

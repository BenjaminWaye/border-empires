// Guardrail for the "building upkeep isn't shown in the build menu" bug
// class: client-tile-action-logic.ts (and its two extracted siblings,
// client-tile-action-neutral.ts and client-tile-action-fort-siege-variants.ts)
// build every build_<type> action's cost/detail string by hand via
// deps.structureCostText(type) plus a free-form suffix. Nothing stops a
// future building from being added there without also calling the shared
// upkeepSuffixFor/upkeepDescriptorFor helper (client-structure-upkeep-text.ts)
// -- the exact gap that shipped Airport's fabricated "36 crystal/day" and
// left the Observatory's real progressive cost as one-off hand-rolled text.
//
// This scans the actual source of the three files that assemble a build
// action's cost string and asserts every structureCostText(<TYPE>) call site
// also calls upkeepSuffixFor for any type with real ongoing upkeep
// (a non-empty structureSlotRequirements or a synthesizer's gold/day drain)
// -- the same definition of "real upkeep" the shared helper itself uses, so
// this test and the helper can never quietly drift apart on what counts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYNTHESIZER_STRUCTURE_TYPES, structureSlotRequirements, type BuildableStructureType, type SlotStructureType } from "@border-empires/shared";

const readSource = (relativePath: string): string => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const logicSource = readSource("./client-tile-action-logic.ts");
const neutralSource = readSource("./client-tile-action-neutral.ts");
const fortSiegeVariantsSource = readSource("./client-tile-action-fort-siege-variants.ts");
const siegeCampSource = readSource("./client-tile-action-siege-camp.ts");

const hasRealUpkeep = (type: string): boolean =>
  structureSlotRequirements(type as SlotStructureType).length > 0 ||
  SYNTHESIZER_STRUCTURE_TYPES.includes(type as BuildableStructureType);

// Every literal structureCostText("TYPE") call across the two files that
// hand-assemble a build action's cost string (the monument-part loop's
// dynamic structureCostText(def.structureType) is covered separately below).
const literalCostTextTypes = (source: string): string[] => {
  const matches = [...source.matchAll(/structureCostText\("([A-Z0-9_]+)"/g)];
  return [...new Set(matches.map((m) => m[1]!))];
};

const lineContaining = (source: string, needle: string): string => {
  const line = source.split("\n").find((candidate) => candidate.includes(needle));
  if (!line) throw new Error(`expected to find a line containing ${needle}`);
  return line;
};

describe("build-menu cost strings always label real upkeep (client-tile-action-logic.ts + siblings)", () => {
  const allTypes = [...new Set([...literalCostTextTypes(logicSource), ...literalCostTextTypes(neutralSource)])];

  it("found at least the known buildable types (sanity check the scan itself works)", () => {
    expect(allTypes).toEqual(expect.arrayContaining(["OBSERVATORY", "AIRPORT", "RELAY_BEACON", "FARMSTEAD", "TITANIUM_WORKS"]));
  });

  for (const type of allTypes) {
    const expectUpkeepCall = hasRealUpkeep(type);
    it(`${type}: ${expectUpkeepCall ? "calls" : "may skip"} upkeepSuffixFor on its cost line`, () => {
      const source = logicSource.includes(`structureCostText("${type}"`) ? logicSource : neutralSource;
      const line = lineContaining(source, `structureCostText("${type}"`);
      if (expectUpkeepCall) {
        expect(line, `${type}'s build-menu cost string never calls upkeepSuffixFor -- a future building shipping without an Upkeep segment`).toContain("upkeepSuffixFor(");
      }
    });
  }

  it("the monument-part build loop labels each part's real CRYSTAL-slot upkeep", () => {
    const line = lineContaining(logicSource, "structureCostText(def.structureType)");
    expect(line).toContain("upkeepSuffixFor(def.structureType)");
  });

  it("the Fort/Siege tier ladder computes upkeepSuffix from the shared helper, not inline slot text", () => {
    expect(fortSiegeVariantsSource).toContain("upkeepSuffixFor(tier.variant)");
    expect(fortSiegeVariantsSource).not.toContain("structureSlotRequirements");
  });

  it("the build_fortification and build_siege_camp actions surface that upkeepSuffix", () => {
    expect(lineContaining(logicSource, "fortVariant.summary")).toContain("fortVariant.upkeepSuffix");
    expect(lineContaining(siegeCampSource, "siegeVariant.summary")).toContain("siegeVariant.upkeepSuffix");
  });

  it("Farmstead and Waterworks are the real zero-upkeep exceptions (sanity check the predicate itself)", () => {
    expect(hasRealUpkeep("FARMSTEAD")).toBe(false);
    expect(hasRealUpkeep("WATERWORKS")).toBe(false);
    expect(hasRealUpkeep("MINE")).toBe(true);
    expect(hasRealUpkeep("TITANIUM_WORKS")).toBe(true);
  });
});

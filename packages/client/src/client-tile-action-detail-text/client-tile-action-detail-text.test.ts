import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildDetailTextForAction } from "./client-tile-action-detail-text.js";
import type { Tile } from "../client-types.js";

const baseTile: Tile = {
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED"
};

describe("buildDetailTextForAction — build_observatory", () => {
  it("states the protection radius, the 3 daily shots, and that protection pauses when they run out", () => {
    const text = buildDetailTextForAction("build_observatory", baseTile);
    expect(text).toContain("protects your own tiles within");
    expect(text).toContain("never covers unclaimed land or other players' tiles");
    expect(text).toMatch(/within \d+ tiles/);
    expect(text).toContain("3 shots per 24h");
    expect(text).toContain("out of shots");
  });
});

describe("buildDetailTextForAction — build_manufactory", () => {
  it("describes the flat income, production bonus, and completion reward", () => {
    const text = buildDetailTextForAction("build_manufactory", baseTile);
    expect(text).toContain("+1 coin/day");
    expect(text).toContain("+10% town coin production");
    expect(text).toContain("+10 instant coin on completion");
  });
});

describe("buildDetailTextForAction — build_hydrogarden (Hydrogarden)", () => {
  it("says it adds +2 FOOD slots on grain resource tiles", () => {
    const text = buildDetailTextForAction("build_hydrogarden", { ...baseTile, resource: "FARM" });
    expect(text).toBe("Adds +2 FOOD slots on grain resource tiles.");
  });

  it("says it does not boost fish tiles", () => {
    expect(buildDetailTextForAction("build_hydrogarden", { ...baseTile, resource: "FISH" })).toBe("Hydrogardens do not boost fish output.");
  });
});

describe("manpower building detail", () => {
  it("shows Neural Works output per batch", () => {
    expect(buildDetailTextForAction("build_neural_works", baseTile)).toContain("+24 manpower per batch");
  });
});

describe("buildDetailTextForAction — manpower structures", () => {
  it("describes the Ancillary Factory instead of returning undefined", () => {
    const text = buildDetailTextForAction("build_ancillary_factory", baseTile);
    expect(text).toBeDefined();
    expect(text).toContain("+12 manpower per batch empire-wide");
    expect(text).toContain("Neural Works");
  });

  it("describes the Reserve Lattice instead of returning undefined", () => {
    const text = buildDetailTextForAction("build_reserve_lattice", baseTile);
    expect(text).toBeDefined();
    expect(text).toContain("Ancillary Depot");
    expect(text).toContain("+35%");
  });

  it("has detail copy for every action the tile menu asks it to describe", () => {
    // The tile menu concatenates this text with a suffix, so a missing entry
    // renders the literal word "undefined" in the build list.
    const sourceDir = fileURLToPath(new URL("../client-tile-action-logic/", import.meta.url));
    const ids = new Set<string>();
    for (const file of readdirSync(sourceDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      for (const match of readFileSync(`${sourceDir}${file}`, "utf8").matchAll(/buildDetailTextForAction\("([a-z0-9_]+)"/g)) ids.add(match[1]!);
    }
    expect(ids.size).toBeGreaterThan(20);
    const missing = [...ids].filter((id) => buildDetailTextForAction(id, baseTile, baseTile) === undefined && id !== "remove_structure");
    expect(missing).toEqual([]);
  });
});

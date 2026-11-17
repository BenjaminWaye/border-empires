import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANCILLARY_FACTORY_STANDALONE_REGEN_PER_MINUTE,
  NETWORK_RESOURCES,
  NEURAL_WORKS_NETWORK_MANPOWER_REGEN_PER_ANCILLARY_FACTORY,
  RESOURCE_NETWORKS,
  ancillaryFactoryCapacityBonus,
  manpowerPerBatch,
  networkBuildAction
} from "@border-empires/shared";
import { MONUMENT_COMPONENT_BUILD_DEFS } from "../client-tile-action-monument-parts/client-tile-action-monument-parts.js";
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
  it("describes the Ancillary Factory with its regen numbers from shared constants", () => {
    const text = buildDetailTextForAction("build_ancillary_factory", baseTile);
    expect(text).toContain(`+${manpowerPerBatch(ANCILLARY_FACTORY_STANDALONE_REGEN_PER_MINUTE)} manpower per batch`);
    expect(text).toContain(`+${manpowerPerBatch(NEURAL_WORKS_NETWORK_MANPOWER_REGEN_PER_ANCILLARY_FACTORY)} more if a Neural Works`);
  });

  it("describes the Reserve Lattice and Ancillary Depot with the capacity shares the server pays", () => {
    // ancillaryFactoryCapacityBonus: 150 + base × (0.35 with a Lattice, else 0.10) per depot.
    // The server zeroes the old +300-per-depot argument whenever a depot is active.
    const lattice = buildDetailTextForAction("build_reserve_lattice", baseTile);
    const depot = buildDetailTextForAction("build_ancillary_depot", baseTile);
    expect(ancillaryFactoryCapacityBonus(1000, 1, false)).toBe(250);
    expect(ancillaryFactoryCapacityBonus(1000, 1, true)).toBe(500);
    expect(lattice).toContain("35%");
    expect(lattice).toContain("instead of 10%");
    expect(depot).toContain("+150 manpower cap plus 10%");
    expect(depot).toContain("35% if a Reserve Lattice");
    expect(`${lattice} ${depot}`).not.toContain("300");
  });

  it("has detail copy for every action the client asks it to describe", () => {
    // Build rows concatenate this text with a suffix, so a missing entry renders
    // the literal word "undefined" (or, behind `?? ""`, an empty description).
    const srcRoot = fileURLToPath(new URL("../", import.meta.url));
    const ids = new Set<string>(NETWORK_RESOURCES.map((resource) => networkBuildAction(resource)));
    ids.add("build_hydrogarden");
    for (const def of MONUMENT_COMPONENT_BUILD_DEFS) ids.add(def.actionId);
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          for (const match of readFileSync(path, "utf8").matchAll(/buildDetailTextForAction\(\s*"([a-z0-9_]+)"/g)) ids.add(match[1]!);
        }
      }
    };
    walk(srcRoot);
    expect(ids.size).toBeGreaterThan(40); // sanity: the scan found the call sites
    // remove_structure only has copy when the tile has a structure on it.
    const missing = [...ids].filter((id) => id !== "remove_structure" && !buildDetailTextForAction(id, baseTile, baseTile));
    expect(missing).toEqual([]);
  });

  it("describes resource-network buildings from their deposit", () => {
    for (const resource of NETWORK_RESOURCES) {
      expect(buildDetailTextForAction(networkBuildAction(resource), baseTile)).toContain(RESOURCE_NETWORKS[resource].description);
    }
  });
});

describe("Hydroworks detail text", () => {
  it("does not claim Hydroworks needs a support tile (it builds on any owned settled tile)", () => {
    const detail = buildDetailTextForAction("build_hydroworks", baseTile) ?? "";
    expect(detail).not.toContain("support tile");
    expect(detail).not.toContain("supported town");
    expect(detail).toContain("any settled tile you own");
  });
});

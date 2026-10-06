import { describe, expect, it } from "vitest";
import { afcModuleOverviewLines } from "./client-afc-module-overview.js";
import type { Tile } from "../client-types.js";
import type { TechInfo } from "../client-tech-info-types.js";

const tech = (id: string, name: string, branch: string): TechInfo => ({
  id,
  name,
  branch,
  tier: 1,
  description: "",
  mods: {},
  requirements: { gold: 0, resources: {} }
});

const CATALOG: TechInfo[] = [
  tech("workshops", "Umbrite Synthesis Module", "economy"),
  tech("masonry", "Titanium Forge Module", "war"),
  tech("crystal-lattices", "Aether Resonance Core", "aether"),
  tech("conveyor-networks", "Reserve Lattice Module", "manpower")
];

const baseTile = (afc?: Tile["afc"]): Tile => ({ x: 0, y: 0, terrain: "LAND", ...(afc ? { afc } : {}) }) as Tile;

describe("afcModuleOverviewLines", () => {
  it("is empty for a tile without an AFC", () => {
    expect(afcModuleOverviewLines(baseTile(), CATALOG)).toEqual([]);
  });

  it("shows a 'no modules commissioned yet' line for a fresh AFC", () => {
    const lines = afcModuleOverviewLines(baseTile({ ownerId: "p1", status: "active" }), CATALOG);
    expect(lines.map((l) => l.html)).toContain("No modules commissioned yet.");
  });

  it("groups docked modules under their Manifest branch, in Economy/Manpower/War/Aether order", () => {
    const lines = afcModuleOverviewLines(
      baseTile({ ownerId: "p1", status: "active", modules: ["masonry", "workshops", "crystal-lattices", "conveyor-networks"] }),
      CATALOG
    );
    const groupHeadings = lines.filter((l) => l.kind === "group").map((l) => l.html);
    expect(groupHeadings).toEqual(["Economy", "Manpower", "War", "Aether"]);
    expect(lines.map((l) => l.html)).toContain("Umbrite Synthesis Module");
    expect(lines.map((l) => l.html)).toContain("Titanium Forge Module");
    // Module rows are nested under their family heading.
    const titaniumForgeLine = lines.find((l) => l.html === "Titanium Forge Module");
    expect(titaniumForgeLine?.nested).toBe(true);
  });

  it("shows a dormant banner when the AFC is inactive, but still lists its modules", () => {
    const lines = afcModuleOverviewLines(baseTile({ ownerId: "p1", status: "inactive", modules: ["masonry"] }), CATALOG);
    expect(lines.some((l) => l.html.includes("Dormant"))).toBe(true);
    expect(lines.map((l) => l.html)).toContain("Titanium Forge Module");
  });

  it("does not throw on a docked tech id missing from the catalog", () => {
    const lines = afcModuleOverviewLines(baseTile({ ownerId: "p1", status: "active", modules: ["some-unbuilt-module-tech"] }), CATALOG);
    expect(lines.filter((l) => l.kind === "group")).toEqual([]);
  });

  it("lists modules still in transit under Incoming with their time to land", () => {
    const lines = afcModuleOverviewLines(
      baseTile({ ownerId: "p1", status: "active", incomingModules: [{ techId: "masonry", arrivesAt: 46_000 }] }),
      CATALOG,
      1_000
    );
    expect(lines.map((l) => l.html)).toEqual(["AFC Modules", "Incoming", "Titanium Forge Module — lands in 45s"]);
  });
});

import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createProspectClueProps } from "./client-map-3d-prospect-clue-props.js";
import { prospectClueTreeTint } from "./client-map-3d-prospect-clue-layer.js";
import { prospectCluePropCount, prospectCluePropsAllowed } from "../client-prospect-clue/client-prospect-clue.js";
import type { Tile } from "../client-types.js";

// Regression: prospect clues used to render in 3D as a flat colour tint only.
// Each clue must now place its own props (blackwood trees, ferrous flecks,
// crystal shards), matching the 2D renderer's per-tile counts.

// Mesh order in createProspectClueProps: [blackwood canopy, blackwood trunk, ferrous fleck, crystal shard].
const countsAfter = (add: (props: ReturnType<typeof createProspectClueProps>) => void): number[] => {
  const scene = new Scene();
  const props = createProspectClueProps(scene, 8);
  add(props);
  props.commit();
  const counts = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh).map((mesh) => mesh.count);
  props.dispose();
  return counts;
};

describe("createProspectClueProps", () => {
  it("plants blackwood trees on an open blackwood tile", () => {
    const trees = prospectCluePropCount("BLACKWOOD_CANOPY", 12, 34);
    expect(countsAfter((p) => p.addTile(0, 0, 0, 12, 34, "BLACKWOOD_CANOPY", false))).toEqual([trees, trees, 0, 0]);
  });

  it("adds no extra trees where the tile already grows forest (that forest is tinted instead)", () => {
    expect(countsAfter((p) => p.addTile(0, 0, 0, 12, 34, "BLACKWOOD_CANOPY", true))).toEqual([0, 0, 0, 0]);
  });

  it("scatters ferrous flecks and crystal shards for the other clues", () => {
    expect(countsAfter((p) => p.addTile(0, 0, 0, 5, 9, "FERROUS_DUST", false))).toEqual([0, 0, prospectCluePropCount("FERROUS_DUST", 5, 9), 0]);
    expect(countsAfter((p) => p.addTile(0, 0, 0, 5, 9, "REFRACTIVE_GROUND", false))).toEqual([0, 0, 0, prospectCluePropCount("REFRACTIVE_GROUND", 5, 9)]);
  });

  it("stops at the instance budget instead of overflowing", () => {
    const counts = countsAfter((p) => {
      for (let i = 0; i < 50; i += 1) p.addTile(0, 0, 0, i, i * 3, "FERROUS_DUST", false);
    });
    expect(counts[2]).toBe(8 * 6);
  });
});

describe("prospect clue tile gating", () => {
  const tile = (extra: Partial<Tile>): Tile => ({ x: 1, y: 1, terrain: "LAND", prospectSignature: "BLACKWOOD_CANOPY", ...extra });

  it("tints trees only on live blackwood land", () => {
    expect(prospectClueTreeTint(tile({}), "LAND", "visible")).toBeDefined();
    expect(prospectClueTreeTint(tile({}), "LAND", "fogged")).toBeUndefined();
    expect(prospectClueTreeTint(tile({ prospectSignature: "FERROUS_DUST" }), "LAND", "visible")).toBeUndefined();
  });

  it("keeps props off tiles that draw their own feature", () => {
    expect(prospectCluePropsAllowed(tile({}))).toBe(true);
    expect(prospectCluePropsAllowed(tile({ resource: "UMBRITE" }))).toBe(false);
    expect(prospectCluePropsAllowed(tile({ dockId: "d1" }))).toBe(false);
    expect(prospectCluePropsAllowed(undefined)).toBe(false);
  });
});

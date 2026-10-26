import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
import { createProspectClueProps } from "./client-map-3d-prospect-clue-props.js";
import { createOwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { createProspectClueLayer } from "./client-map-3d-prospect-clue-layer.js";
import { prospectCluePropCount, prospectCluePropsAllowed } from "../client-prospect-clue/client-prospect-clue.js";
import type { TechInfo, Tile } from "../client-types.js";

// Regression: prospect clues used to render in 3D as a flat colour tint only.
// Each clue must now place its own props (a blackwood swirl over forest,
// grey titanium chips, crystal shards), matching the 2D renderer's per-tile counts.

// Mesh order in the scene: [blackwood swirl, ferrous fleck, crystal shard].
const meshesOf = (scene: Scene): InstancedMesh[] => scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);

const countsAfter = (add: (props: ReturnType<typeof createProspectClueProps>) => void): number[] => {
  const scene = new Scene();
  const props = createProspectClueProps(scene, 8);
  add(props);
  props.commit();
  const counts = meshesOf(scene).map((mesh) => mesh.count);
  props.dispose();
  return counts;
};

const flat = (): number => 0;

describe("createProspectClueProps", () => {
  it("raises one blackwood swirl over a blackwood forest tile, and nothing on open ground", () => {
    expect(countsAfter((p) => p.addTile(0, 0, 0, flat, 12, 34, "BLACKWOOD_CANOPY", true))).toEqual([1, 0, 0]);
    expect(countsAfter((p) => p.addTile(0, 0, 0, flat, 12, 34, "BLACKWOOD_CANOPY", false))).toEqual([0, 0, 0]);
  });

  it("scatters ferrous chips and crystal shards for the other clues", () => {
    expect(countsAfter((p) => p.addTile(0, 0, 0, flat, 5, 9, "FERROUS_DUST", false))).toEqual([0, prospectCluePropCount("FERROUS_DUST", 5, 9), 0]);
    expect(countsAfter((p) => p.addTile(0, 0, 0, flat, 5, 9, "REFRACTIVE_GROUND", false))).toEqual([0, 0, prospectCluePropCount("REFRACTIVE_GROUND", 5, 9)]);
  });

  // Review finding: flecks/shards sat at surfaceY (the tile's highest point) and floated on hills and slopes.
  it("sits ground props on groundYAt, not on the tile's highest point", () => {
    const scene = new Scene();
    const props = createProspectClueProps(scene, 4);
    props.addTile(0, 0, 5, (ox) => ox, 5, 9, "FERROUS_DUST", false);
    props.commit();
    const fleckMesh = meshesOf(scene)[1]!;
    const matrix = new Matrix4();
    const position = new Vector3();
    for (let i = 0; i < fleckMesh.count; i += 1) {
      fleckMesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      expect(position.y).toBeCloseTo(position.x + 0.01, 5);
    }
    props.dispose();
  });

  it("draws low ground clues after every ownership bucket, while preserving terrain occlusion", () => {
    const scene = new Scene();
    const props = createProspectClueProps(scene, 4);
    const ownership = createOwnershipOverlay(scene, 4);
    for (const mesh of meshesOf(scene).slice(1)) {
      // renderOrder alone cannot move an opaque mesh past transparent ownership.
      expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
      const material = mesh.material as MeshStandardMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(1);
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(true);
      for (const tint of [ownership.settledMesh, ownership.frontierMesh, ownership.settledHillMesh, ownership.frontierHillMesh]) {
        expect(mesh.renderOrder).toBeGreaterThan(tint.renderOrder);
      }
      expect(mesh.renderOrder).toBeLessThan(RENDER_ORDER.fogDarkenSettled);
    }
    ownership.dispose();
    props.dispose();
  });

  it("stops at the instance budget instead of overflowing", () => {
    const counts = countsAfter((p) => {
      for (let i = 0; i < 50; i += 1) p.addTile(0, 0, 0, flat, i, i * 3, "FERROUS_DUST", false);
    });
    expect(counts[1]).toBe(8 * 6);
  });
});

describe("prospect clue tile gating", () => {
  const tile = (extra: Partial<Tile>): Tile => ({ x: 1, y: 1, terrain: "LAND", prospectSignature: "FERROUS_DUST", ...extra });
  const noTech = { techIds: [], techCatalog: [] };

  const layerCounts = (args: { tile: Tile; forestOnTile?: boolean; techState?: { techIds: string[]; techCatalog: TechInfo[] } }): number[] => {
    const scene = new Scene();
    const layer = createProspectClueLayer(scene, 4);
    layer.addTile({
      tile: args.tile, terrain: "LAND", visibility: "visible", x: 0, z: 0, wx: 1, wy: 1, wxNext: 2, wyNext: 2,
      surfaceY: 0, flatOverlayY: 0, cornerYAt: () => 0, forestOnTile: args.forestOnTile ?? false, techState: args.techState ?? noTech
    });
    layer.commit();
    const counts = meshesOf(scene).map((mesh) => mesh.count);
    layer.dispose();
    return counts;
  };

  it("keeps props off tiles that draw their own feature", () => {
    expect(prospectCluePropsAllowed(tile({}))).toBe(true);
    expect(prospectCluePropsAllowed(tile({ resource: "UMBRITE" }))).toBe(false);
    expect(prospectCluePropsAllowed(tile({ dockId: "d1" }))).toBe(false);
    expect(prospectCluePropsAllowed(tile({ watchtower: { activated: false } }))).toBe(false);
    expect(prospectCluePropsAllowed(tile({ shardSite: { kind: "CACHE", amount: 3 } }))).toBe(false);
    expect(prospectCluePropsAllowed(undefined)).toBe(false);
  });

  it("hides a clue once the player has revealed its resource", () => {
    const catalog = [{ id: "survey", effects: { revealResource: "titanium" } }] as unknown as TechInfo[];
    expect(layerCounts({ tile: tile({}) })[1]).toBeGreaterThan(0);
    expect(layerCounts({ tile: tile({}), techState: { techIds: ["survey"], techCatalog: catalog } })[1]).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { Box3, InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { FORT_CONSTRUCTION_LAYOUT, type ConstructionLayout } from "../client-map-3d-construction/client-map-3d-construction-layout.js";
import { FORT_TOWER_INNER, FORT_WALL_INNER } from "../client-map-3d-fort-overlay.js";
import { DISTRICT_BUILDING_KINDS, DISTRICT_PROJECT_KINDS } from "./district-catalog.js";
import { createDistrictGeometry } from "./district-geometry.js";
import { createDistrictMap3D, fortInteriorScale } from "./district-map-3d.js";
import { districtFixture } from "./district-fixtures.js";

const siteLayouts = vi.hoisted(() => [] as (ConstructionLayout | undefined)[]);
vi.mock("../client-map-3d-construction/client-map-3d-construction-presentation.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../client-map-3d-construction/client-map-3d-construction-presentation.js")>();
  return {
    ...actual,
    createLazyConstructionPresentation: (...args: Parameters<typeof actual.createLazyConstructionPresentation>) => {
      const inner = actual.createLazyConstructionPresentation(...args);
      return { ...inner, addSite: (...site: Parameters<typeof inner.addSite>) => { siteLayouts.push(site[5]); inner.addSite(...site); } };
    }
  };
});

const fortOf = (tile: Tile): NonNullable<Tile["fort"]> => ({ ownerId: tile.ownerId!, status: "active" }) as NonNullable<Tile["fort"]>;

const render = (decorate: (building: Tile) => void) => {
  const fixture = districtFixture(), scene = new Scene();
  decorate(fixture.building);
  const state = { tiles: fixture.tiles, tilesRevision: 1, selected: undefined, me: "p1", dormantStructures: [] as ClientState["dormantStructures"] };
  const map = createDistrictMap3D(scene, 8, { state, origin: { camX: 100, camY: 100 },
    visibilityAt: () => "visible", cornerYAt: () => 0, isHillsAt: () => false, hillCutAt: () => undefined, rise: 0.01 });
  map.clear();
  const tile = fixture.building;
  map.addTile(tile, { x: tile.x - 100 + 0.5, z: tile.y - 100 + 0.5, wx: tile.x, wy: tile.y, surfaceY: 0 }, Date.now());
  map.commit();
  // The building's own body mesh, not the foundation-only slab placed beside it on a fort tile.
  const body = scene.children.find((child): child is InstancedMesh =>
    child instanceof InstancedMesh && child.name.startsWith("town-district-MANUFACTORY-") && child.name.endsWith("-body") && child.count > 0)!;
  const matrix = new Matrix4(); body.getMatrixAt(0, matrix);
  const placed = { position: new Vector3().setFromMatrixPosition(matrix), scale: new Vector3().setFromMatrixScale(matrix) };
  map.dispose();
  return placed;
};

describe("district building inside a fort", () => {
  it("stands centred at full size, not halved into a corner", () => {
    const open = render(() => undefined);
    const fortified = render(tile => { tile.fort = fortOf(tile); });
    expect(fortified.scale.x).toBeCloseTo(1);
    expect(fortified.position.x).toBeCloseTo(open.position.x);
    expect(fortified.position.z).toBeCloseTo(open.position.z);
  });

  it("still compacts the building when an Aether Tower shares the fort tile", () => {
    const shared = render(tile => { tile.fort = fortOf(tile); tile.observatory = { ownerId: "p1", status: "active", supportAnchor: { x: 100, y: 100 } }; });
    expect(shared.scale.x).toBeCloseTo(0.5);
  });

  it("keeps the build site's parts stack and crew inside the walls", () => {
    siteLayouts.length = 0;
    render(tile => {
      tile.fort = fortOf(tile);
      tile.economicStructure = { ...tile.economicStructure!, status: "under_construction", startedAt: Date.now() - 1_000, completesAt: Date.now() + 60_000 } as NonNullable<Tile["economicStructure"]>;
    });
    expect(siteLayouts).toEqual([FORT_CONSTRUCTION_LAYOUT]);
  });

  it.each([...DISTRICT_BUILDING_KINDS, ...DISTRICT_PROJECT_KINDS])("%s clears the fort walls and corner towers at its fort scale", kind => {
    const geometry = createDistrictGeometry(kind, false), box = new Box3();
    for (const layer of Object.values(geometry.layers)) { layer!.computeBoundingBox(); box.union(layer!.boundingBox!); }
    const scale = fortInteriorScale(kind);
    const halfX = Math.max(-box.min.x, box.max.x) * scale, halfZ = Math.max(-box.min.z, box.max.z) * scale;
    expect(Math.max(halfX, halfZ)).toBeLessThan(FORT_WALL_INNER);
    expect(Math.min(halfX, halfZ)).toBeLessThan(FORT_TOWER_INNER);
  });
});

import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import type { ClientState } from "../client-state/client-state.js";
import { createDistrictMap3D } from "./district-map-3d.js";
import { districtFixture } from "./district-fixtures.js";

const setup = () => {
  const fixture = districtFixture(), scene = new Scene();
  const state = { tiles: fixture.tiles, tilesRevision: 1, selected: undefined, me: "p1", dormantStructures: [] as ClientState["dormantStructures"] };
  let visible = true;
  const map = createDistrictMap3D(scene, 8, { state, origin: { camX: 100, camY: 100 },
    visibilityAt: () => visible ? "visible" : "fogged", cornerYAt: x => (x - 100) * 0.05,
    isHillsAt: () => false, hillCutAt: () => undefined, rise: 0.01 });
  const rebuild = () => {
    map.clear();
    for (const tile of [fixture.town, fixture.building]) map.addTile(tile,
      { x: tile.x - 100 + 0.5, z: tile.y - 100 + 0.5, wx: tile.x, wy: tile.y, surfaceY: 0 }, 1_000);
    map.commit();
  };
  return { ...fixture, scene, map, state, rebuild, hide: () => { visible = false; } };
};

describe("live 3D district adapter", () => {
  it("anchors connections to the new committed terrain window after panning", () => {
    const fixture = setup(); fixture.rebuild();
    const link = fixture.scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && !child.name);
    expect(link).toBeDefined();
    const before = new Matrix4(), after = new Matrix4(); link!.getMatrixAt(0, before);
    fixture.map.commit({ camX: 102, camY: 100 }); link!.getMatrixAt(0, after);
    expect(after.elements[12]).toBeCloseTo(before.elements[12]! - 2);
    fixture.map.dispose();
  });
  it("requests a rebuild when dormancy changes or a timed disable expires", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const fixture = setup();
    try {
      fixture.building.economicStructure!.disabledUntil = 2_000;
      fixture.rebuild(); expect(fixture.map.boundaryPassed()).toBe(false);
      fixture.state.dormantStructures = [{ key: "101,100:economicStructure", resources: [] }];
      expect(fixture.map.boundaryPassed()).toBe(true);
      fixture.rebuild(); expect(fixture.map.boundaryPassed()).toBe(false);
      clock.mockReturnValue(2_001); expect(fixture.map.boundaryPassed()).toBe(true);
      fixture.rebuild(); expect(fixture.map.boundaryPassed()).toBe(false);
    } finally { fixture.map.dispose(); clock.mockRestore(); }
  });
  it("seats models on the terrain footprint and removes links on capture and fog changes", () => {
    const fixture = setup(); fixture.rebuild();
    expect(fixture.map.diagnostics.models.instances).toBe(1);
    expect(fixture.map.diagnostics.links.edges).toBeGreaterThan(0);
    const mesh = fixture.scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.name.endsWith("-body"));
    expect(mesh).toBeDefined();
    const matrix = new Matrix4(), position = new Vector3(); mesh!.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix);
    expect(position.y).toBeGreaterThan(0.08);
    fixture.town.ownerId = "p2"; fixture.rebuild();
    expect(fixture.map.diagnostics.links.edges).toBe(0);
    expect(fixture.map.diagnostics.models.instances).toBe(1);
    fixture.hide(); fixture.rebuild();
    expect(fixture.map.diagnostics.models.instances).toBe(0);
    fixture.map.dispose(); expect(fixture.scene.children).toHaveLength(0);
  });
  it("uses a shared slab and compact bodies when an observatory shares a support tile", () => {
    const fixture = setup();
    fixture.building.observatory = { ownerId: "p1", status: "active", supportAnchor: { x: 100, y: 100 } };
    fixture.rebuild();
    expect(fixture.map.diagnostics.models.instances).toBe(3);
    const bodies = fixture.scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh && child.name.endsWith("-body") && !child.name.includes("undefined"));
    expect(bodies).toHaveLength(2);
    for (const mesh of bodies) {
      const matrix = new Matrix4(), scale = new Vector3(); mesh.getMatrixAt(0, matrix); scale.setFromMatrixScale(matrix);
      expect(scale.x).toBeCloseTo(0.5);
    }
    fixture.map.dispose();
  });
});

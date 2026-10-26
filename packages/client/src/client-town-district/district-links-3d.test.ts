import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createDistrictLinks3D } from "./district-links-3d.js";
import type { DistrictEdge } from "./district-network.js";

const edge: DistrictEdge = { id: "test", townKey: "100,100", from: { x: 100, y: 100 }, to: { x: 101, y: 100 }, active: true, buried: false, traceable: true };
const setup = () => {
  const scene = new Scene(); let selected: string | undefined;
  const links = createDistrictLinks3D(scene, 4, { origin: { camX: 100, camY: 100 }, surfaceAt: () => 0, selectedTown: () => selected });
  const count = () => scene.children.reduce((sum, mesh) => sum + (mesh instanceof InstancedMesh ? mesh.count : 0), 0);
  return { links, count, select: (town: string | undefined) => { selected = town; links.refreshSelection(); } };
};
describe("district link visibility", () => {
  it("hides endpoint posts together with an untraceable connection", () => {
    const { links, count } = setup(); links.commit([{ ...edge, traceable: false }]);
    expect(count()).toBe(0); links.dispose();
  });
  it("hides buried posts until their town is selected, and removes them on deselection", () => {
    const { links, count, select } = setup(); links.commit([{ ...edge, buried: true }]);
    expect(count()).toBe(0);
    select(edge.townKey); expect(count()).toBeGreaterThan(0);
    select(undefined); expect(count()).toBe(0); links.dispose();
  });
});

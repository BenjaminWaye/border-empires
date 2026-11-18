import { Group, Mesh, MeshStandardMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createWaystationOpenFxLayer } from "./holo-crate-open-fx-3d.js";
import { WAYSTATION_OPEN_TOTAL_MS } from "./holo-crate-open-fx.js";

const findDoor = (group: Group): Object3D | undefined => {
  let door: Object3D | undefined;
  group.traverse((o) => { if (!door && o.children.length === 5 && !(o instanceof Mesh) && o.children.every((c) => c instanceof Mesh)) door = o; });
  return door;
};

describe("3D waystation opening", () => {
  it("drops the door, fades the stack out and removes itself after 10 s", () => {
    const parent = new Group();
    const layer = createWaystationOpenFxLayer(parent);
    layer.spawn(2, 3, 0.1, 1000, 7);
    expect(layer.activeCount()).toBe(1);
    layer.update(1000);
    const door = findDoor(layer.group);
    expect(door?.rotation.x).toBe(0);
    layer.update(1000 + 3000);
    expect(door!.rotation.x).toBeCloseTo(Math.PI / 2, 2); // folded flat like a ramp
    const hull = (layer.group.children[0]!.children[0]!.children.find((c) => c instanceof Mesh) as Mesh).material as MeshStandardMaterial;
    expect(hull.opacity).toBe(1);
    layer.update(1000 + 9500);
    expect(hull.transparent).toBe(true);
    expect(hull.opacity).toBeCloseTo(0.5, 2);
    layer.update(1000 + WAYSTATION_OPEN_TOTAL_MS);
    expect(layer.activeCount()).toBe(0);
    expect(layer.group.children).toHaveLength(0);
    layer.dispose();
    expect(parent.children).toHaveLength(0);
  });
});

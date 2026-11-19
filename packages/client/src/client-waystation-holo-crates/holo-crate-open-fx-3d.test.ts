import { Group, Mesh, MeshStandardMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createWaystationOpenFxLayer } from "./holo-crate-open-fx-3d.js";
import { WAYSTATION_OPEN_HOLD_MAX_MS, WAYSTATION_OPEN_TOTAL_MS, type WaystationOpenFxEntry } from "./holo-crate-open-fx.js";

const findDoor = (group: Group): Object3D | undefined => {
  let door: Object3D | undefined;
  group.traverse((o) => { if (!door && o.children.length === 5 && !(o instanceof Mesh) && o.children.every((c) => c instanceof Mesh)) door = o; });
  return door;
};
const rig = (covered = false) => {
  const clock = { wall: 50_000, covered };
  const parent = new Group();
  const layer = createWaystationOpenFxLayer(parent, undefined, () => clock.covered, () => clock.wall);
  const entry: WaystationOpenFxEntry = { x: 2, y: 3, detectedAt: clock.wall };
  layer.spawn(2, 3, 0.1, entry, 7);
  return { clock, parent, layer, entry, tick: (ms: number) => { clock.wall += ms; layer.update(clock.wall); } };
};

describe("3D waystation opening", () => {
  it("drops the door, fades the stack out and removes itself after 10 s", () => {
    const { parent, layer, tick } = rig();
    tick(0);
    const door = findDoor(layer.group);
    expect(door?.rotation.x).toBe(0);
    tick(3000);
    expect(door!.rotation.x).toBeCloseTo(Math.PI / 2, 2); // folded flat like a ramp
    const hull = (layer.group.children[0]!.children[0]!.children.find((c) => c instanceof Mesh) as Mesh).material as MeshStandardMaterial;
    expect(hull.opacity).toBe(1);
    tick(6500);
    expect(hull.transparent).toBe(true);
    expect(hull.opacity).toBeCloseTo(0.5, 2);
    tick(500);
    expect(layer.activeCount()).toBe(0);
    expect(layer.group.children).toHaveLength(0);
    layer.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("holds closed while the reward card covers the map, then plays the full 10 s once it is closed", () => {
    // Regression: the timeline ran behind the reward card, so closing it showed the cache already teleporting out.
    const { clock, layer, entry, tick } = rig(true);
    tick(12_000);
    const door = findDoor(layer.group)!;
    expect(layer.activeCount()).toBe(1);
    expect(door.rotation.x).toBe(0);
    expect(entry.startedAt).toBeUndefined();
    clock.covered = false;
    tick(16);
    expect(entry.startedAt).toBe(clock.wall);
    tick(3000);
    expect(door.rotation.x).toBeCloseTo(Math.PI / 2, 2);
    tick(WAYSTATION_OPEN_TOTAL_MS - 3000);
    expect(layer.activeCount()).toBe(0);
  });

  it("gives up on an opening held for too long", () => {
    const { layer, tick } = rig(true);
    tick(WAYSTATION_OPEN_HOLD_MAX_MS);
    expect(layer.activeCount()).toBe(0);
  });
});

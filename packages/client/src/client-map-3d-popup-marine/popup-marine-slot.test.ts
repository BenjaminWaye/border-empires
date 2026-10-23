import { describe, expect, it } from "vitest";
import { AnimationClip, Bone, BufferGeometry, Group, MeshStandardMaterial, Scene, Skeleton, SkinnedMesh } from "three";
import { MARINE_CLIP_NAMES, type PopupMarineTemplate } from "./popup-marine-asset.js";
import { createMarineSlot } from "./popup-marine-slot.js";

// A minimal rig carrying both hand bones and the three battle clips the slot
// binds, so createMarineSlot can clone it without a real .glb.
const fakeTemplate = (): PopupMarineTemplate => {
  const hips = new Bone();
  hips.name = "Hips";
  const left = new Bone();
  left.name = "LeftHand";
  const right = new Bone();
  right.name = "RightHand";
  hips.add(left, right);
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  mesh.add(hips);
  mesh.bind(new Skeleton([hips, left, right]));
  const root = new Group();
  root.add(mesh);
  const clips = new Map(Object.values(MARINE_CLIP_NAMES).map((name) => [name, new AnimationClip(name, 1, [])]));
  return { root, clips };
};

describe("createMarineSlot muzzle-flash bone", () => {
  it("pins a standard marine's flash to its pistol (right) hand", () => {
    const slot = createMarineSlot(new Scene(), fakeTemplate(), 0, "standard");
    expect(slot.handBone?.name).toBe("RightHand");
  });

  it("pins the titanium war-walker's flash to its gatling (left) hand, not the saw arm", () => {
    const slot = createMarineSlot(new Scene(), fakeTemplate(), 0, "titanium");
    expect(slot.handBone?.name).toBe("LeftHand");
  });
});

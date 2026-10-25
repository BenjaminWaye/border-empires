import { AnimationClip, Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, VectorKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";
import { createMarineSlot, playMarineStance, type MarineSlot } from "./popup-marine-slot.js";

// Each firing clip parks the Hips at its own x (y = 0); the Dead clip sweeps
// the Hips' y with clip time (x = 0), so the Hips position read back after
// playMarineStance says exactly which clips are playing, how heavily, and at
// what point of the Dead clip.
const STANCE_X = { PistolRun: 1, PistolIdle: 2, PistolKneelingIdle: 3 };

const makeSlot = (): MarineSlot => {
  const hips = new Bone();
  hips.name = "Hips";
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Array(12).fill(0), 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const root = new Group();
  root.add(mesh, hips);
  mesh.bind(new Skeleton([hips]));
  const clips = new Map<string, AnimationClip>(
    Object.entries(STANCE_X).map(([name, x]) => [name, new AnimationClip(name, 1, [new VectorKeyframeTrack("Hips.position", [0, 1], [x, 0, 0, x, 0, 0])])])
  );
  clips.set("Dead", new AnimationClip("Dead", 2.4, [new VectorKeyframeTrack("Hips.position", [0, 2.4], [0, 0, 0, 0, 2.4, 0])]));
  return createMarineSlot(new Scene(), { root, clips }, 0);
};

const hipsAfter = (stance: "run" | "stand" | "kneel", fallT: number): { x: number; y: number } => {
  const slot = makeSlot();
  playMarineStance(slot, stance, 0, fallT);
  const hips = slot.root.getObjectByName("Hips")!;
  return { x: hips.position.x, y: hips.position.y };
};

describe("playMarineStance: a killed marine's Dead clip", () => {
  it("plays only the firing clip while the marine is up", () => {
    expect(hipsAfter("stand", 0)).toEqual({ x: 2, y: 0 });
  });

  it("runs fallT through the Dead clip's 1s..2s fall window", () => {
    expect(hipsAfter("stand", 0.5).y).toBeCloseTo(1.5, 5);
    expect(hipsAfter("stand", 1)).toEqual({ x: 0, y: expect.closeTo(2, 5) });
  });

  it("starts a kneeling marine's fall at 1.2s, already at kneeling height", () => {
    expect(hipsAfter("kneel", 0.5).y).toBeCloseTo(1.6, 5);
    expect(hipsAfter("kneel", 1).y).toBeCloseTo(2, 5);
  });

  // Regression: the fall used to switch to the Dead pose in one frame, which
  // snapped a kneeling marine upright and swung the rifle ~80 degrees.
  it("cross-fades from the firing clip into the fall instead of snapping", () => {
    const early = hipsAfter("stand", 0.1);
    expect(early.x).toBeCloseTo(1, 5); // half the standing clip's x = 2
    expect(early.y).toBeCloseTo(0.5 * 1.1, 5); // half the Dead clip at 1.1s
  });
});

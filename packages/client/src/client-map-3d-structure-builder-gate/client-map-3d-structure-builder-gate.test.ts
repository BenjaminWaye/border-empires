import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import { createStructurePieceBuilder } from "../client-map-3d-structure-builder.js";

// docs/construction-animation-plan.md: a structure under construction shows
// only the height bands built so far, by skipping pieces above a gate.
const setup = () => {
  const scene = new Scene();
  const internals = createStructurePieceBuilder(scene, 8);
  // Unit box (half-height 0.5) and a slot for rotated pieces.
  internals.builder.makeSlot("box", new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 8);
  return internals;
};

const setupWithScene = () => {
  const scene = new Scene();
  const internals = createStructurePieceBuilder(scene, 8);
  internals.builder.makeSlot("box", new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 8);
  return { ...internals, scene };
};

describe("structure piece builder construction gate", () => {
  it("measure() returns the highest point reached and places nothing", () => {
    const { builder } = setup();
    const top = builder.measure(() => {
      builder.addPiece("box", 0, 0, 0, 0, 0.5, 0, 1, 0.2, 1); // top = 0.5 + 0.1
      builder.addPiece("box", 0, 0, 0, 0, 0.1, 0, 1, 0.2, 1);
    });
    expect(top).toBeCloseTo(0.6, 5);
    // Nothing was placed: the next real piece takes slot 0.
    expect(builder.addPiece("box", 0, 0, 0, 0, 0, 0)).toBe(0);
  });

  it("measure() uses the rotated extent, so a horizontal rod is not counted as tall", () => {
    const { builder } = setup();
    // A 1-tall box scaled to a long thin rod, laid flat by a quarter turn about Z.
    const top = builder.measure(() => {
      builder.addPiece("box", 0, 0, 0, 0, 0.2, 0, 0.05, 1, 0.05, 0, 0, Math.PI / 2);
    });
    expect(top).toBeCloseTo(0.2 + 0.025, 4);
  });

  it("skips pieces whose base is above the gate and keeps the rest", () => {
    const { builder } = setup();
    builder.setGate(0.25);
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.1, 0, 1, 0.2, 1)).toBe(0); // base 0.0, fits under the cut
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.5, 0, 1, 0.2, 1)).toBe(-1); // base 0.4
    builder.setGate(undefined);
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.5, 0, 1, 0.2, 1)).toBe(1);
  });

  it("grows a tall upright piece to the cut instead of showing it whole", () => {
    const { builder, scene } = setupWithScene();
    builder.setGate(0.3);
    // A 0.6-tall shaft standing on the ground: only the lower half is built.
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.3, 0, 1, 0.6, 1)).toBe(0);
    const mesh = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    expect(Math.hypot(m.elements[4]!, m.elements[5]!, m.elements[6]!)).toBeCloseTo(0.3, 5); // scale y 0.6 -> 0.3
    expect(m.elements[13]).toBeCloseTo(0.15, 5); // base still at the ground: centre 0.3 -> 0.15
  });

  it("keeps the growing piece's base fixed at every cut", () => {
    const { builder, scene } = setupWithScene();
    const mesh = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const m = new Matrix4();
    for (const [i, cut] of [0.15, 0.3, 0.45].entries()) {
      builder.setGate(cut);
      builder.addPiece("box", 0, 0, 0, 0, 0.3, 0, 1, 0.6, 1);
      mesh.getMatrixAt(i, m);
      const height = Math.hypot(m.elements[4]!, m.elements[5]!, m.elements[6]!);
      expect(m.elements[13]! - height / 2).toBeCloseTo(0, 5); // bottom edge on the ground
      expect(height).toBeCloseTo(cut, 5); // top edge at the cut
    }
  });

  it("does not grow tilted or small pieces: they appear whole once their base is built", () => {
    const { builder, scene } = setupWithScene();
    builder.setGate(0.1);
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.1, 0, 1, 0.6, 1, 0, 0, Math.PI / 4)).toBe(0); // tilted
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.04, 0, 1, 0.06, 1)).toBe(1); // thinner than the growth threshold
    const mesh = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const m = new Matrix4();
    mesh.getMatrixAt(1, m);
    expect(Math.hypot(m.elements[4]!, m.elements[5]!, m.elements[6]!)).toBeCloseTo(0.06, 5);
  });

  it("clear() does not reset the gate, so callers must unset it themselves", () => {
    const { builder, clear } = setup();
    builder.setGate(0);
    clear();
    expect(builder.addPiece("box", 0, 0, 0, 0, 1, 0)).toBe(-1);
  });
});

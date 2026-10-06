import { describe, expect, it } from "vitest";
import { BoxGeometry, MeshStandardMaterial, Scene } from "three";
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
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.1, 0, 1, 0.2, 1)).toBe(0); // base 0.0
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.5, 0, 1, 0.2, 1)).toBe(-1); // base 0.4
    // A tall piece that starts below the cut still appears.
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.3, 0, 1, 0.6, 1)).toBe(1); // base 0.0
    builder.setGate(undefined);
    expect(builder.addPiece("box", 0, 0, 0, 0, 0.5, 0, 1, 0.2, 1)).toBe(2);
  });

  it("clear() does not reset the gate, so callers must unset it themselves", () => {
    const { builder, clear } = setup();
    builder.setGate(0);
    clear();
    expect(builder.addPiece("box", 0, 0, 0, 0, 1, 0)).toBe(-1);
  });
});

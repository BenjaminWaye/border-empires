import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Object3D, Scene } from "three";
import { createDockOverlay } from "./client-map-3d-dock-overlay.js";
import { HARBOUR_SLOT_LOOKS, QUAY_PARTS, SLIPWAY_PARTS, type HarbourPart } from "./client-map-3d-harbour/client-map-3d-harbour-parts.js";

const SLOTS = HARBOUR_SLOT_LOOKS.length;
const perSlot = (parts: readonly HarbourPart[]): number[] => {
  const counts = new Array<number>(SLOTS).fill(0);
  for (const piece of parts) counts[piece.slot] = (counts[piece.slot] ?? 0) + 1;
  return counts;
};
// Every visible tile holds at most one harbour piece, so each slot reserves room for the piece that uses it most.
const RESERVED_PER_TILE = perSlot(QUAY_PARTS).reduce((total, quay, slot) => total + Math.max(quay, perSlot(SLIPWAY_PARTS)[slot] ?? 0, 1), 0);

const instancedMeshes = (scene: Scene): InstancedMesh[] => {
  const meshes: InstancedMesh[] = [];
  const visit = (children: unknown[]): void => {
    for (const child of children) {
      if (child instanceof InstancedMesh) meshes.push(child);
      else if (child instanceof Object3D) visit(child.children);
    }
  };
  visit(scene.children);
  return meshes;
};

const renderedPieces = (scene: Scene): number =>
  instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);

describe("dock overlay", () => {
  it("commits a fully assembled quay: pier, toll house, steam derrick, freight, harbour lamp and ferry", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // A change that drops a part (say the ferry's funnel or the hoisted crate)
    // changes this total and must be reviewed here.
    expect(renderedPieces(scene)).toBe(QUAY_PARTS.length);
    expect(instancedMeshes(scene)).toHaveLength(SLOTS);

    overlay.dispose();
  });

  it("commits a full landing slipway, and only its ramp and barge when shrunk", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addSlipway(0, 0, 0, 0, "full");
    overlay.commit();
    expect(renderedPieces(scene)).toBe(SLIPWAY_PARTS.length);

    overlay.clear();
    overlay.addSlipway(0, 0, 0, 0, "shrunk");
    overlay.commit();
    expect(renderedPieces(scene)).toBe(SLIPWAY_PARTS.filter((piece) => piece.core).length);
    expect(renderedPieces(scene)).toBeLessThan(SLIPWAY_PARTS.length);

    overlay.dispose();
  });

  it("pushes a shrunk slipway out to the waterline, toward the sea it faces", () => {
    // The ramp is the first deck instance of a lone slipway. Shrunk, it sits
    // further toward the water (+z here) so it clears the tile's other structure.
    const rampZ = (fit: "full" | "shrunk"): number => {
      const scene = new Scene();
      const overlay = createDockOverlay(scene, 10);
      overlay.addSlipway(0, 0, 0, 0, fit);
      overlay.commit();
      const deck = instancedMeshes(scene).find((mesh) => mesh.name === "dock-2")!;
      const matrix = new Matrix4();
      deck.getMatrixAt(0, matrix);
      overlay.dispose();
      return matrix.elements[14]!;
    };
    expect(rampZ("shrunk")).toBeGreaterThan(rampZ("full"));
  });

  it("renders every harbour piece in a multi-dock frame completely", () => {
    // Regression for the storybook Row view: per-slot capacity is maxTiles *
    // parts-per-tile, so placing several pieces in one commit must not drop
    // the parts of pieces after the first.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 4);

    for (let i = 0; i < 2; i += 1) overlay.addInstance(i * 1.4, 0, 0, 0, i, 0);
    for (let i = 0; i < 2; i += 1) overlay.addSlipway(i * 1.4, 1, 0, 0, "full");
    overlay.commit();

    expect(renderedPieces(scene)).toBe(2 * QUAY_PARTS.length + 2 * SLIPWAY_PARTS.length);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    expect(renderedPieces(scene)).toBeGreaterThan(0);

    overlay.clear();
    overlay.commit();
    expect(renderedPieces(scene)).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("reserves maxTiles * the busiest piece per slot, no more than the old dock's 64 parts per tile", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce((total, mesh) => total + mesh.instanceMatrix.array.length * 4, 0);
    const bytesPerPart = 16 * 4;
    expect(totalBytes).toBe(14_000 * RESERVED_PER_TILE * bytesPerPart);
    expect(RESERVED_PER_TILE).toBeLessThanOrEqual(64);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("rotates the whole dock exactly once around the tile center", () => {
    // Regression: addInstance used to pre-rotate the part position AND then
    // multiply by the outer rotation matrix, so positions rotated twice while
    // orientations rotated once — every dock that faced a non-zero direction
    // came out garbled (only the unrotated Row/FacingSouth docks looked right).
    // The toll house door is the first dark-timber instance of a lone quay,
    // at model (-0.24, 0.15, -0.115); under a clean rotationY it must land at
    // centerX/centerZ + RY(rot) * that local offset. centerX/centerZ must NOT
    // themselves be rotated: they are the tile's own world position.
    const doorPosition = (scene: Scene, centerX: number, centerZ: number, rotationY: number): number[] => {
      const overlay = createDockOverlay(scene, 100);
      overlay.addInstance(centerX, centerZ, 0, rotationY, 0, 0);
      overlay.commit();
      const door = instancedMeshes(scene).find((mesh) => mesh.name === "dock-7")!;
      const matrix = new Matrix4();
      door.getMatrixAt(0, matrix);
      overlay.dispose();
      return [matrix.elements[12]!, matrix.elements[13]!, matrix.elements[14]!];
    };

    // RY(90deg) faces the quay east: local (x, z) -> (z, -x), so the door at the back lands on the inland (west) side.
    expect(doorPosition(new Scene(), 0, 0, Math.PI / 2).map((v) => Math.round(v * 1000))).toEqual([-115, 150, 240]);
    // RY(180deg): (x, z) -> (-x, -z)
    expect(doorPosition(new Scene(), 0, 0, Math.PI).map((v) => Math.round(v * 1000))).toEqual([240, 150, 115]);
    // Off-centre tile: only the local offset rotates; the centre translates untouched.
    expect(doorPosition(new Scene(), 10, -4, Math.PI / 2).map((v) => Math.round(v * 1000))).toEqual([9885, 150, -3760]);
  });

  it("re-uploads the used range on every commit so a swapped dock is never stale", () => {
    // commit() only runs when the visible tile set changed. A dock leaving and
    // another entering keeps the per-slot instance counts identical, so a
    // "count unchanged" skip would leave the previous dock's matrices on the
    // GPU. Every commit must re-mark the used range for upload (three r179
    // re-uploads when the setter-only needsUpdate bumps the attribute's
    // `version`).
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    const versionsAfterFirst = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (const version of versionsAfterFirst) expect(version).toBeGreaterThan(0);

    // Same number of docks, different tile (per-slot counts unchanged): the
    // matrices were re-written, so the upload must be marked again, not skipped.
    overlay.clear();
    overlay.addInstance(1, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();
    const versionsAfterSwap = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (let i = 0; i < versionsAfterFirst.length; i += 1) {
      expect(versionsAfterSwap[i]!).toBeGreaterThan(versionsAfterFirst[i]!);
    }

    overlay.dispose();
  });
});

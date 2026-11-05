import { describe, expect, it } from "vitest";
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createRelayReceiverSegment } from "../client-map-3d-relay-receiver.js";

describe("gravity receiver frame", () => {
  it("has an open measuring aperture instead of a reflective dish surface", () => {
    const geometry = createRelayReceiverSegment(), material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    const aperture = new Raycaster(new Vector3(0.4, 0, 2), new Vector3(0, 0, -1));
    expect(aperture.intersectObject(mesh)).toHaveLength(0);
    const frame = new Raycaster(new Vector3(1, 0.3, 2), new Vector3(0, 0, -1));
    expect(frame.intersectObject(mesh).length).toBeGreaterThan(0);
    geometry.dispose(); material.dispose();
  });
  it("keeps the suspension and calibration blocks inside a finite, bounded assembly", () => {
    const geometry = createRelayReceiverSegment();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    expect(bounds.min.y).toBeLessThan(-0.99);
    expect(bounds.max.y).toBeGreaterThan(0.99);
    expect(bounds.max.x).toBeLessThan(1.1);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(0.15);
    expect(Array.from(geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
    expect(geometry.getAttribute("position").count / 3).toBeLessThan(1500);
    geometry.dispose();
  });
});

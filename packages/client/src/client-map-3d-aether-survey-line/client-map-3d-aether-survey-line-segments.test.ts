import { describe, expect, it } from "vitest";
import { Group, Mesh } from "three";
import { createSurveyLineSegmentPool } from "./client-map-3d-aether-survey-line-segments.js";

const p0 = { x: 0, y: 0, z: 0 };
const p1 = { x: 2, y: 0, z: 0 };
const meshes = (group: Group): Mesh[] => group.children.filter((child): child is Mesh => child instanceof Mesh);

describe("createSurveyLineSegmentPool", () => {
  it("draws my own border thicker, with a white-hot core, and rivals' thinner without one", () => {
    const group = new Group();
    const pool = createSurveyLineSegmentPool(group, 2);
    pool.clear();
    pool.add(p0, p1, "#2a4bff", 1, "own", 0);
    pool.add(p0, p1, "#e53935", 1, "rival", 0);
    pool.commit();
    const [ownLine, ownCore, rivalLine, rivalCore] = meshes(group);
    expect(ownLine!.visible).toBe(true);
    expect(ownCore!.visible).toBe(true);
    expect(rivalLine!.visible).toBe(true);
    expect(rivalCore!.visible).toBe(false);
    expect(ownLine!.scale.x).toBeGreaterThan(rivalLine!.scale.x);
    expect((ownLine!.material as { opacity: number }).opacity).toBeGreaterThan((rivalLine!.material as { opacity: number }).opacity);
    pool.dispose();
  });

  it("hides unused slots on commit and counts drops past capacity", () => {
    const group = new Group();
    const pool = createSurveyLineSegmentPool(group, 1);
    pool.clear();
    pool.add(p0, p1, "#2a4bff", 1, "own", 0);
    pool.add(p0, p1, "#2a4bff", 1, "own", 0);
    expect(pool.droppedCount()).toBe(1);
    pool.clear();
    pool.commit();
    expect(meshes(group).every((mesh) => !mesh.visible)).toBe(true);
    pool.dispose();
  });

  it("pulses only my own border", () => {
    const group = new Group();
    const pool = createSurveyLineSegmentPool(group, 2);
    pool.clear();
    pool.add(p0, p1, "#2a4bff", 1, "own", 0);
    pool.add(p0, p1, "#e53935", 1, "rival", 0);
    const [ownLine, , rivalLine] = meshes(group);
    const opacityOf = (mesh: Mesh): number => (mesh.material as { opacity: number }).opacity;
    const samples = [0, 600, 1200, 1800].map((nowMs) => {
      pool.update(nowMs);
      return { own: opacityOf(ownLine!), rival: opacityOf(rivalLine!) };
    });
    expect(new Set(samples.map((s) => s.own.toFixed(4))).size).toBeGreaterThan(1);
    expect(new Set(samples.map((s) => s.rival.toFixed(4))).size).toBe(1);
    pool.dispose();
  });
});

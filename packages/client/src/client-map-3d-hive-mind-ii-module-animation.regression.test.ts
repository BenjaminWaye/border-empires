// Regression tests for the Hive Mind II (HMM2) AFC module overlay's animation.
//
// The module re-emits only its moving parts on `update(nowMs)` — the ring's
// three teeth (orbiting at the advancing roll, which makes the flat ring's spin
// legible) and the cyan pulse sliding along the synchronization bridge. The
// ring itself is a flat torus, rotationally symmetric about its spin axis, so
// it and every static part (cores, bridge, relays, gimbal, spine, lights) are
// emitted once and hold still. These tests pin the determinism, part-count
// stability and the exact tooth/pulse kinematics those animations depend on.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  HIVE_MIND_II_SCALE as S,
  createHiveMindIiModuleOverlay
} from "./client-map-3d-hive-mind-ii-module.js";
import {
  HMM2_PULSE,
  HMM2_RING_SPEED_MS,
  HMM2_RING_START_ROLL,
  HMM2_TOOTH
} from "./client-map-3d-hive-mind-ii-parts.js";
import {
  bridgeMesh,
  coreMesh,
  instancedMeshes,
  matrixAt,
  pulseMesh,
  relayMesh,
  ringMesh,
  toothMesh,
  translation
} from "./client-map-3d-hive-mind-ii-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createHiveMindIiModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createHiveMindIiModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("hive mind ii module animation", () => {
  it("orbits the ring's teeth and slides the bridge pulse, holding everything else still", () => {
    const { scene, overlay } = build(2);
    const toothBefore = [0, 1, 2, 3, 4, 5].map((i) => matrixAt(toothMesh(scene)!, i));
    const pulseBefore = [0, 1].map((i) => matrixAt(pulseMesh(scene)!, i));
    const ringBefore = [0, 1].map((i) => matrixAt(ringMesh(scene)!, i));
    const coreBefore = [0, 1, 2, 3].map((i) => matrixAt(coreMesh(scene)!, i));
    const bridgeBefore = [0, 1].map((i) => matrixAt(bridgeMesh(scene)!, i));
    const relayBefore = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => matrixAt(relayMesh(scene)!, i));
    overlay.update(5000);
    // The moving parts re-render at the new clock time.
    expect([0, 1, 2, 3, 4, 5].map((i) => matrixAt(toothMesh(scene)!, i))).not.toEqual(toothBefore);
    expect([0, 1].map((i) => matrixAt(pulseMesh(scene)!, i))).not.toEqual(pulseBefore);
    // Everything else stays exactly as emitted — the flat ring is emitted once
    // in data, and the cores, bridge and relays never move.
    expect([0, 1].map((i) => matrixAt(ringMesh(scene)!, i))).toEqual(ringBefore);
    expect([0, 1, 2, 3].map((i) => matrixAt(coreMesh(scene)!, i))).toEqual(coreBefore);
    expect([0, 1].map((i) => matrixAt(bridgeMesh(scene)!, i))).toEqual(bridgeBefore);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => matrixAt(relayMesh(scene)!, i))).toEqual(relayBefore);
  });

  it("keeps the whole family's part counts stable across updates", () => {
    const { scene, overlay } = build(2);
    const countsBefore = instancedMeshes(scene).map((mesh) => mesh.count);
    overlay.update(1000);
    overlay.update(2000);
    expect(toothMesh(scene)!.count).toBe(6);
    expect(pulseMesh(scene)!.count).toBe(2);
    expect(instancedMeshes(scene).map((mesh) => mesh.count)).toEqual(countsBefore);
  });

  it("advances deterministically with the clock: same time re-renders identically, later time differs", () => {
    const { scene, overlay } = build(1);
    overlay.update(1200);
    const toothAt = matrixAt(toothMesh(scene)!, 0);
    const pulseAt = matrixAt(pulseMesh(scene)!, 0);
    overlay.update(1200);
    expect(matrixAt(toothMesh(scene)!, 0)).toEqual(toothAt);
    expect(matrixAt(pulseMesh(scene)!, 0)).toEqual(pulseAt);
    overlay.update(4800);
    expect(matrixAt(toothMesh(scene)!, 0)).not.toEqual(toothAt);
    expect(matrixAt(pulseMesh(scene)!, 0)).not.toEqual(pulseAt);
  });

  it("spots the teeth at the advancing roll on the ring's radius", () => {
    const { scene, overlay } = build(1);
    const nowMs = 3333;
    overlay.update(nowMs);
    const roll = HMM2_RING_START_ROLL + nowMs * HMM2_RING_SPEED_MS;
    for (let k = 0; k < 3; k += 1) {
      const a = roll + (k * Math.PI * 2) / 3;
      const t = translation(toothMesh(scene)!, k);
      expect(t.x).toBeCloseTo(Math.cos(a) * HMM2_TOOTH.radius * S, 4);
      expect(t.y).toBeCloseTo(HMM2_TOOTH.y * S, 4);
      expect(t.z).toBeCloseTo(Math.sin(a) * HMM2_TOOTH.radius * S, 4);
    }
  });

  it("slides the cyan pulse along the bridge with a clamped sine", () => {
    const { scene, overlay } = build(1);
    overlay.update(0);
    const t0 = translation(pulseMesh(scene)!, 0);
    expect(t0.x).toBeCloseTo(0, 6);
    expect(t0.z).toBeCloseTo(0, 6);
    expect(t0.y).toBeCloseTo(HMM2_PULSE.y * S, 6);
    const nowMs = 1900;
    overlay.update(nowMs);
    const t1 = translation(pulseMesh(scene)!, 0);
    expect(t1.z).toBeCloseTo(HMM2_PULSE.travel * Math.sin(nowMs * HMM2_PULSE.speed) * S, 4);
    expect(t1.x).toBeCloseTo(0, 6);
    expect(t1.y).toBeCloseTo(HMM2_PULSE.y * S, 6);
  });
});
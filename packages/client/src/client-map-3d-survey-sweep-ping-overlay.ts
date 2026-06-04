import {
  AdditiveBlending,
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  RingGeometry,
  Scene,
  Vector3
} from "three";
import type { SurveySweepPingKind } from "./client-types.js";

const MAX_PINGS = 256;
const HOVER_BASE_Y = 0.46;

export type SurveySweepPingOverlay = {
  readonly group: Group;
  readonly beginFrame: () => void;
  readonly addPing: (
    kind: SurveySweepPingKind,
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    nowMs: number,
    createdAt: number,
    expiresAt: number
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const createSurveySweepPingOverlay = (scene: Scene): SurveySweepPingOverlay => {
  const group = new Group();
  group.name = "survey-sweep-ping-overlay";
  scene.add(group);

  const resourceGeometry = new OctahedronGeometry(0.11, 0);
  const townGeometry = new BoxGeometry(0.2, 0.14, 0.06);
  const ringGeometry = new RingGeometry(0.18, 0.22, 28);

  const resourceMaterial = new MeshBasicMaterial({ color: "#8ff1ff", transparent: true, opacity: 0.86, blending: AdditiveBlending, depthWrite: false });
  const townMaterial = new MeshBasicMaterial({ color: "#f2c86a", transparent: true, opacity: 0.88, blending: AdditiveBlending, depthWrite: false });
  const resourceRingMaterial = new MeshBasicMaterial({ color: "#5edff4", transparent: true, opacity: 0.34, blending: AdditiveBlending, depthWrite: false });
  const townRingMaterial = new MeshBasicMaterial({ color: "#f2c86a", transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false });

  const resourceMesh = new InstancedMesh(resourceGeometry, resourceMaterial, MAX_PINGS);
  const townMesh = new InstancedMesh(townGeometry, townMaterial, MAX_PINGS);
  const resourceRingMesh = new InstancedMesh(ringGeometry, resourceRingMaterial, MAX_PINGS);
  const townRingMesh = new InstancedMesh(ringGeometry, townRingMaterial, MAX_PINGS);

  for (const mesh of [resourceMesh, townMesh, resourceRingMesh, townRingMesh]) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const dummy = new Object3D();
  const ringMatrix = new Matrix4();
  const ringScale = new Vector3();
  let resourceCount = 0;
  let townCount = 0;

  const beginFrame = (): void => {
    resourceCount = 0;
    townCount = 0;
  };

  const addPing: SurveySweepPingOverlay["addPing"] = (kind, sceneX, sceneZ, surfaceY, nowMs, createdAt, expiresAt): void => {
    const count = kind === "resource" ? resourceCount : townCount;
    if (count >= MAX_PINGS) return;

    const lifeT = clamp01((nowMs - createdAt) / Math.max(1, expiresAt - createdAt));
    const fade = Math.sin(lifeT * Math.PI);
    const pulse = 0.86 + Math.sin(nowMs / 180 + sceneX * 0.7 + sceneZ * 0.3) * 0.1;
    const hoverY = surfaceY + HOVER_BASE_Y + Math.sin(nowMs / 420 + sceneX) * 0.045;
    dummy.position.set(sceneX, hoverY, sceneZ);
    dummy.rotation.set(kind === "resource" ? nowMs / 520 : 0.08, nowMs / 360, 0);
    dummy.scale.setScalar(Math.max(0.05, fade) * pulse);
    dummy.updateMatrix();

    ringMatrix.makeRotationX(-Math.PI / 2);
    ringMatrix.setPosition(sceneX, surfaceY + 0.085, sceneZ);
    ringMatrix.scale(ringScale.set(0.8 + fade * 0.5, 0.8 + fade * 0.5, 0.8 + fade * 0.5));

    if (kind === "resource") {
      resourceMesh.setMatrixAt(resourceCount, dummy.matrix);
      resourceRingMesh.setMatrixAt(resourceCount, ringMatrix);
      resourceCount += 1;
    } else {
      townMesh.setMatrixAt(townCount, dummy.matrix);
      townRingMesh.setMatrixAt(townCount, ringMatrix);
      townCount += 1;
    }
  };

  const commit = (): void => {
    resourceMesh.count = resourceCount;
    townMesh.count = townCount;
    resourceRingMesh.count = resourceCount;
    townRingMesh.count = townCount;
    resourceMesh.instanceMatrix.needsUpdate = true;
    townMesh.instanceMatrix.needsUpdate = true;
    resourceRingMesh.instanceMatrix.needsUpdate = true;
    townRingMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    resourceGeometry.dispose();
    townGeometry.dispose();
    ringGeometry.dispose();
    resourceMaterial.dispose();
    townMaterial.dispose();
    resourceRingMaterial.dispose();
    townRingMaterial.dispose();
  };

  return { group, beginFrame, addPing, commit, dispose };
};

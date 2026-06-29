import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { crystalTargetingTone } from "../client-tile-action-logic/client-tile-action-logic.js";
import type { CrystalTargetingAbility } from "../client-types.js";

const TONE_COLORS = {
  red: { fill: "#ff6464", stroke: "#ff6e6e", line: "#ff9090" },
  cyan: { fill: "#71dfff", stroke: "#74e3ff", line: "#99f0ff" },
  amber: { fill: "#ffbb48", stroke: "#ffc966", line: "#ffdb84" }
} as const;

type SyncCrystalLineDeps = {
  ct: { active: boolean; ability: string; validTargets: Set<string>; originByTarget: Map<string, string> };
  hover: { x: number; y: number } | undefined;
  selected: { x: number; y: number } | undefined;
  keyFor: (x: number, y: number) => string;
  camX: number;
  camY: number;
  cornerYAt: (x: number, y: number) => number;
  tileSurfaceY: (x: number, y: number) => number;
  toroidDelta: (center: number, point: number, worldSize: number) => number;
};

export type CrystalTargetingOverlay = {
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly sync: (deps: SyncCrystalLineDeps) => void;
  readonly dispose: () => void;
};

const createBendingMarkerGeometry = (): BufferGeometry => {
  const geom = new BufferGeometry();
  const positions = new Float32Array(24);
  geom.setAttribute("position", new BufferAttribute(positions, 3));
  return geom;
};

const writeBendingMarkerCorners = (
  geom: BufferGeometry,
  cx: number,
  cy: number,
  cz: number,
  cornerY00: number,
  cornerY10: number,
  cornerY01: number,
  cornerY11: number,
  rise: number
): void => {
  const positionAttr = geom.getAttribute("position") as BufferAttribute;
  const positions = positionAttr.array as Float32Array;
  const x0 = cx - 0.48;
  const x1 = cx + 0.48;
  const z0 = cz - 0.48;
  const z1 = cz + 0.48;
  const y00 = cy + cornerY00 + rise;
  const y10 = cy + cornerY10 + rise;
  const y01 = cy + cornerY01 + rise;
  const y11 = cy + cornerY11 + rise;
  positions[0] = x0; positions[1] = y00; positions[2] = z0;
  positions[3] = x1; positions[4] = y10; positions[5] = z0;
  positions[6] = x1; positions[7] = y10; positions[8] = z0;
  positions[9] = x1; positions[10] = y11; positions[11] = z1;
  positions[12] = x1; positions[13] = y11; positions[14] = z1;
  positions[15] = x0; positions[16] = y01; positions[17] = z1;
  positions[18] = x0; positions[19] = y01; positions[20] = z0;
  positions[21] = x0; positions[22] = y00; positions[23] = z0;
  positionAttr.needsUpdate = true;
};

export const createCrystalTargetingOverlay = (scene: Scene, maxTiles: number): CrystalTargetingOverlay => {
  const group = new Group();
  group.name = "crystal-targeting-overlay";
  scene.add(group);

  const fillGeometry = new PlaneGeometry(0.96, 0.96);
  fillGeometry.rotateX(-Math.PI * 0.5);
  const fillMaterial = new MeshBasicMaterial({
    color: TONE_COLORS.red.fill,
    transparent: true,
    opacity: 0.12,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const fillMesh = new InstancedMesh(fillGeometry, fillMaterial, maxTiles);
  fillMesh.frustumCulled = false;
  fillMesh.renderOrder = 14;
  fillMesh.count = 0;

  const lineGeom = new BufferGeometry();
  const linePositions = new Float32Array(6);
  lineGeom.setAttribute("position", new BufferAttribute(linePositions, 3));
  const lineMaterial = new LineBasicMaterial({
    color: TONE_COLORS.red.line,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false
  });
  const lineMesh = new LineSegments(lineGeom, lineMaterial);
  lineMesh.frustumCulled = false;
  lineMesh.renderOrder = 15;
  lineMesh.visible = false;

  const targetOutlineGeom = createBendingMarkerGeometry();
  const targetOutlineMaterial = new LineBasicMaterial({
    color: TONE_COLORS.red.stroke,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false
  });
  const targetOutline = new LineSegments(targetOutlineGeom, targetOutlineMaterial);
  targetOutline.frustumCulled = false;
  targetOutline.renderOrder = 15;
  targetOutline.visible = false;

  const originOutlineGeom = createBendingMarkerGeometry();
  const originOutlineMaterial = new LineBasicMaterial({
    color: TONE_COLORS.red.stroke,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false
  });
  const originOutline = new LineSegments(originOutlineGeom, originOutlineMaterial);
  originOutline.frustumCulled = false;
  originOutline.renderOrder = 15;
  originOutline.visible = false;

  group.add(fillMesh, lineMesh, targetOutline, originOutline);

  const tempMatrix = new Matrix4();
  let fillCount = 0;

  let committed = true;

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    if (committed) { fillCount = 0; committed = false; }
    if (fillCount >= maxTiles) return;
    tempMatrix.makeTranslation(centerX, surfaceY, centerZ);
    fillMesh.setMatrixAt(fillCount, tempMatrix);
    fillCount += 1;
  };

  const commit = (): void => {
    if (fillCount > 0) {
      fillMesh.count = fillCount;
      fillMesh.instanceMatrix.needsUpdate = true;
      fillMesh.visible = true;
    } else {
      fillMesh.visible = false;
    }
    committed = true;
  };

  const parseTileKey = (k: string): { x: number; y: number } => {
    const parts = k.split(",");
    return { x: Number(parts[0]), y: Number(parts[1]) };
  };

  const sync = (deps: SyncCrystalLineDeps): void => {
    lineMesh.visible = false;
    targetOutline.visible = false;
    originOutline.visible = false;
    if (!deps.ct.active) return;
    const tone = crystalTargetingTone(deps.ct.ability as CrystalTargetingAbility);
    const colors = TONE_COLORS[tone];
    fillMaterial.color.set(colors.fill);
    lineMaterial.color.set(colors.line);
    targetOutlineMaterial.color.set(colors.stroke);
    originOutlineMaterial.color.set(colors.stroke);
    const hoveredKey = deps.hover ? deps.keyFor(deps.hover.x, deps.hover.y) : "";
    const selectedKey = deps.selected ? deps.keyFor(deps.selected.x, deps.selected.y) : "";
    const targetKey = deps.ct.validTargets.has(hoveredKey)
      ? hoveredKey
      : deps.ct.validTargets.has(selectedKey)
        ? selectedKey
        : "";
    if (!targetKey) return;
    const target = parseTileKey(targetKey);
    const originKey = deps.ct.originByTarget.get(targetKey);
    const rise = 0.012;
    if (originKey) {
      const origin = parseTileKey(originKey);
      const ox = deps.toroidDelta(deps.camX, origin.x, WORLD_WIDTH) + 0.5;
      const oz = deps.toroidDelta(deps.camY, origin.y, WORLD_HEIGHT) + 0.5;
      const tx = deps.toroidDelta(deps.camX, target.x, WORLD_WIDTH) + 0.5;
      const tz = deps.toroidDelta(deps.camY, target.y, WORLD_HEIGHT) + 0.5;
      const originSurfaceY = deps.tileSurfaceY(origin.x, origin.y) + rise;
      const targetSurfaceY = deps.tileSurfaceY(target.x, target.y) + rise;
      const pos = lineMesh.geometry.getAttribute("position") as BufferAttribute;
      const arr = pos.array as Float32Array;
      arr[0] = ox; arr[1] = originSurfaceY; arr[2] = oz;
      arr[3] = tx; arr[4] = targetSurfaceY; arr[5] = tz;
      pos.needsUpdate = true;
      lineMesh.geometry.computeBoundingSphere();
      lineMesh.visible = true;
      writeBendingMarkerCorners(
        originOutline.geometry as BufferGeometry,
        ox, 0, oz,
        deps.cornerYAt(origin.x, origin.y),
        deps.cornerYAt(origin.x + 1 > WORLD_WIDTH ? 0 : origin.x + 1, origin.y),
        deps.cornerYAt(origin.x, origin.y + 1 > WORLD_HEIGHT ? 0 : origin.y + 1),
        deps.cornerYAt(origin.x + 1 > WORLD_WIDTH ? 0 : origin.x + 1, origin.y + 1 > WORLD_HEIGHT ? 0 : origin.y + 1),
        rise
      );
      originOutline.visible = true;
    }
    writeBendingMarkerCorners(
      targetOutline.geometry as BufferGeometry,
      deps.toroidDelta(deps.camX, target.x, WORLD_WIDTH) + 0.5, 0,
      deps.toroidDelta(deps.camY, target.y, WORLD_HEIGHT) + 0.5,
      deps.cornerYAt(target.x, target.y),
      deps.cornerYAt(target.x + 1 > WORLD_WIDTH ? 0 : target.x + 1, target.y),
      deps.cornerYAt(target.x, target.y + 1 > WORLD_HEIGHT ? 0 : target.y + 1),
      deps.cornerYAt(target.x + 1 > WORLD_WIDTH ? 0 : target.x + 1, target.y + 1 > WORLD_HEIGHT ? 0 : target.y + 1),
      rise
    );
    targetOutline.visible = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    fillGeometry.dispose();
    fillMaterial.dispose();
    lineGeom.dispose();
    lineMaterial.dispose();
    targetOutlineGeom.dispose();
    targetOutlineMaterial.dispose();
    originOutlineGeom.dispose();
    originOutlineMaterial.dispose();
  };

  return { addInstance, commit, sync, dispose };
};

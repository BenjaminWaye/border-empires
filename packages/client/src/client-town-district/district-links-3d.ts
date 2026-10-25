import { Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type Scene, type Texture } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { DISTRICT_BASE_LIFT, DISTRICT_PORT_Y } from "./district-catalog.js";
import type { DistrictEdge, DistrictPoint } from "./district-network.js";

export type DistrictLinkDeps = {
  readonly origin: { camX: number; camY: number };
  readonly surfaceAt: (point: DistrictPoint) => number;
  readonly selectedTown: () => string | undefined;
};

export const createDistrictLinks3D = (scene: Scene, maxEdges: number, deps: DistrictLinkDeps, envMap?: Texture): {
  readonly commit: (edges: readonly DistrictEdge[]) => void;
  readonly refreshSelection: () => void;
  readonly dispose: () => void;
  readonly diagnostics: { edges: number; overflow: number };
} => {
  const geometry = new CylinderGeometry(1, 1, 1, 6);
  const dark = new MeshStandardMaterial({ color: "#32353b", metalness: 0.6, roughness: 0.48 });
  const brass = new MeshStandardMaterial({ color: "#bc9653", metalness: 0.7, roughness: 0.45 });
  applyBuildingEnvMap(dark, envMap);
  applyBuildingEnvMap(brass, envMap);
  const glow = new MeshBasicMaterial({ toneMapped: false });
  let body: InstancedMesh | undefined, rail: InstancedMesh | undefined, light: InstancedMesh | undefined;
  let capacity = 0;
  let edges: readonly DistrictEdge[] = [];
  let selected: string | undefined;
  const diagnostics = { edges: 0, overflow: 0 };
  const matrix = new Matrix4(), rotation = new Quaternion(), position = new Vector3(), scale = new Vector3();
  const axis = new Vector3(0, 1, 0), direction = new Vector3();
  const color = new Color();
  const disposeMeshes = (): void => {
    for (const mesh of [body, rail, light]) if (mesh) { scene.remove(mesh); mesh.dispose(); }
  };
  const ensure = (count: number): void => {
    if (capacity >= count) return;
    disposeMeshes();
    capacity = 2 ** Math.ceil(Math.log2(Math.max(1, count)));
    body = new InstancedMesh(geometry, dark, capacity);
    rail = new InstancedMesh(geometry, brass, capacity * 2);
    light = new InstancedMesh(geometry, glow, capacity);
    for (const mesh of [body, rail, light]) { mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh); }
  };
  const point = (p: DistrictPoint): Vector3 => new Vector3(
    toroidDelta(deps.origin.camX, p.x, WORLD_WIDTH),
    deps.surfaceAt(p) + DISTRICT_BASE_LIFT + DISTRICT_PORT_Y,
    toroidDelta(deps.origin.camY, p.y, WORLD_HEIGHT)
  );
  const pipe = (mesh: InstancedMesh, index: number, a: Vector3, b: Vector3, radius: number): void => {
    direction.subVectors(b, a);
    const length = direction.length();
    rotation.setFromUnitVectors(axis, direction.normalize());
    position.copy(a).add(b).multiplyScalar(0.5);
    scale.set(radius, Math.max(0.0001, length), radius);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  };
  const draw = (): void => {
    selected = deps.selectedTown();
    const segments: Array<{ a: Vector3; b: Vector3; edge: DistrictEdge }> = [];
    const posts = new Map<string, Vector3>();
    for (const edge of edges) {
      const a = point(edge.from), b = point(edge.to);
      // World wrapping must also choose the short endpoint displacement.
      b.x = a.x + toroidDelta(edge.from.x, edge.to.x, WORLD_WIDTH);
      b.z = a.z + toroidDelta(edge.from.y, edge.to.y, WORLD_HEIGHT);
      posts.set(`${edge.from.x},${edge.from.y}`, a);
      posts.set(`${edge.to.x},${edge.to.y}`, b);
      if (!edge.traceable) continue;
      if (!edge.buried) segments.push({ a, b, edge });
      else if (edge.townKey === selected) {
        const steps = Math.max(2, Math.ceil(a.distanceTo(b) / 0.08));
        for (let i = 0; i < steps; i += 2) segments.push({ a: a.clone().lerp(b, i / steps), b: a.clone().lerp(b, (i + 1) / steps), edge });
      }
    }
    const count = Math.min(maxEdges * 8, segments.length + posts.size);
    ensure(count);
    if (!body || !rail || !light) return;
    let i = 0;
    for (const segment of segments) {
      if (i >= count) { diagnostics.overflow += 1; break; }
      const { a, b, edge } = segment;
      pipe(body, i, a, b, edge.buried ? 0.003 : 0.014);
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      const offset = new Vector3(-dz / length * 0.023, 0.009, dx / length * 0.023);
      pipe(rail, i * 2, a.clone().add(offset), b.clone().add(offset), 0.004);
      offset.x *= -1; offset.z *= -1;
      pipe(rail, i * 2 + 1, a.clone().add(offset), b.clone().add(offset), 0.004);
      const lift = new Vector3(0, 0.014, 0);
      pipe(light, i, a.clone().add(lift), b.clone().add(lift), 0.0035);
      color.set(edge.active ? edge.townKey === selected ? "#fff0b5" : "#c6a871" : "#494641");
      light.setColorAt(i, color);
      i += 1;
    }
    const railCount = i * 2, lightCount = i;
    for (const top of posts.values()) {
      if (i >= count) break;
      const base = top.clone();
      base.y -= DISTRICT_PORT_Y;
      pipe(body, i, base, top, 0.014);
      i += 1;
    }
    body.count = i; rail.count = railCount; light.count = lightCount;
    for (const mesh of [body, rail, light]) mesh.instanceMatrix.needsUpdate = true;
    if (light.instanceColor) light.instanceColor.needsUpdate = true;
  };
  return {
    diagnostics,
    commit: next => { edges = next.slice(0, maxEdges); diagnostics.edges = edges.length; if (next.length > maxEdges) diagnostics.overflow += next.length - maxEdges; draw(); },
    refreshSelection: () => { if (selected !== deps.selectedTown()) draw(); },
    dispose: () => { disposeMeshes(); geometry.dispose(); dark.dispose(); brass.dispose(); glow.dispose(); edges = []; }
  };
};

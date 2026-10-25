import { BufferGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene, Vector3 } from "three";
import { structureDisplayName } from "@border-empires/shared";
import type { StructureInfoKey } from "../client-map-display.js";
import { createStructureReviewModel } from "./structure-review-model.js";

type Face = { readonly points: readonly Vector3[]; readonly depth: number; readonly fill: string; readonly opacity: number };
/** Deterministic 2D projection of the production mesh, for exports and audits. */
export const structureReviewSvg = (kind: StructureInfoKey): string => {
  const scene = new Scene(), model = createStructureReviewModel(scene, kind, undefined, false);
  const forward = new Vector3(0.65, 0.85, 1).normalize();
  const right = new Vector3(1, 0, -0.65).normalize(), up = new Vector3().crossVectors(forward, right);
  const light = new Vector3(-0.3, 0.85, 0.55).normalize();
  const faces: Face[] = [];
  for (const mesh of scene.children) {
    if (!(mesh instanceof Mesh)) continue;
    const geometry: BufferGeometry = mesh.geometry;
    const positions = geometry.getAttribute("position"), index = geometry.index;
    const count = mesh instanceof InstancedMesh ? mesh.count : 1;
    for (let instance = 0; instance < count; instance++) {
      const transform = new Matrix4();
      if (mesh instanceof InstancedMesh) mesh.getMatrixAt(instance, transform);
      transform.premultiply(mesh.matrixWorld);
      for (let n = 0; n < (index?.count ?? positions.count); n += 3) {
        const group = geometry.groups.find(group => n >= group.start && n < group.start + group.count);
        const material = Array.isArray(mesh.material) ? mesh.material[group?.materialIndex ?? 0] : mesh.material;
        if (!(material instanceof MeshStandardMaterial)) continue;
        const ids = [0, 1, 2].map(offset => index ? index.getX(n + offset) : n + offset);
        const vertices = ids.map(id => new Vector3().fromBufferAttribute(positions, id).applyMatrix4(transform));
        const [a, b, c] = vertices; if (!a || !b || !c) continue;
        const normal = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
        if (normal.dot(forward) <= 0) continue;
        const shade = 0.55 + Math.max(0, normal.dot(light)) * 0.45;
        const color = material.color.clone();
        const vertexColors = geometry.getAttribute("color");
        if (material.vertexColors && vertexColors) {
          const id = ids[0] ?? 0;
          color.multiply(new Color(vertexColors.getX(id), vertexColors.getY(id), vertexColors.getZ(id)));
        }
        color.multiplyScalar(shade).add(material.emissive.clone().multiplyScalar(material.emissiveIntensity * 0.3));
        faces.push({ points: vertices.map(v => new Vector3(v.dot(right), -v.dot(up), 0)),
          depth: (a.dot(forward) + b.dot(forward) + c.dot(forward)) / 3,
          fill: `#${color.getHexString()}`, opacity: material.opacity });
      }
    }
  }
  model.dispose();
  if (!faces.length) throw new Error(`No visible geometry for ${kind}`);
  const points = faces.flatMap(face => face.points);
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const scale = 112 / Math.max(maxX - minX, maxY - minY);
  const project = (p: Vector3): string => `${(64 + (p.x - (minX + maxX) / 2) * scale).toFixed(1)},${(64 + (p.y - (minY + maxY) / 2) * scale).toFixed(1)}`;
  faces.sort((a, b) => a.depth - b.depth);
  const paths = faces.map(face => `<path fill="${face.fill}"${face.opacity < 1 ? ` opacity="${face.opacity}"` : ""} d="M${face.points.map(project).join("L")}Z"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>${structureDisplayName(kind)}</title>${paths.join("")}</svg>\n`;
};

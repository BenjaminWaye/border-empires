import { AdditiveBlending, BufferGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, Vector3 } from "three";

type Face = { readonly points: readonly Vector3[]; readonly depth: number; readonly fill: string; readonly opacity: number };

/** The fixed 3/4 view every export uses: screen x is v·RIGHT, screen y is -v·UP. */
export const PROJECTION_FORWARD = new Vector3(0.65, 0.85, 1).normalize();
export const PROJECTION_RIGHT = new Vector3(1, 0, -0.65).normalize();
export const PROJECTION_UP = new Vector3().crossVectors(PROJECTION_FORWARD, PROJECTION_RIGHT);

export type ProjectionOptions = {
  /** Drop faces under this many square SVG units: detailed models would otherwise bloat the file. */
  readonly minFaceArea?: number;
  /** Fixed SVG units per model unit, with the model origin at the SVG centre. Default: fit the drawing's own extents to 112 units. */
  readonly scale?: number;
};

/** Flat-shaded, front-facing faces of `root`'s meshes (instanced or not) in
 * projected model units. Skips halo/steam meshes and additive glows. */
const projectedFaces = (root: Object3D): Face[] => {
  root.updateMatrixWorld(true);
  const forward = PROJECTION_FORWARD, right = PROJECTION_RIGHT, up = PROJECTION_UP;
  const light = new Vector3(-0.3, 0.85, 0.55).normalize();
  const faces: Face[] = [];
  const meshes: Mesh[] = [];
  root.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  for (const mesh of meshes) {
    if (mesh.name.endsWith("-halo") || mesh.name.endsWith("-steam")) continue;
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
        if (!(material instanceof MeshStandardMaterial) && !(material instanceof MeshBasicMaterial)) continue;
        if (material.blending === AdditiveBlending) continue;
        const ids = [0, 1, 2].map(offset => index ? index.getX(n + offset) : n + offset);
        const vertices = ids.map(id => new Vector3().fromBufferAttribute(positions, id).applyMatrix4(transform));
        const [a, b, c] = vertices; if (!a || !b || !c) continue;
        const normal = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
        if (normal.dot(forward) <= 0) continue;
        const shade = material instanceof MeshBasicMaterial ? 1 : 0.55 + Math.max(0, normal.dot(light)) * 0.45;
        const color = material.color.clone();
        const vertexColors = geometry.getAttribute("color");
        if (material.vertexColors && vertexColors) {
          const id = ids[0] ?? 0;
          color.multiply(new Color(vertexColors.getX(id), vertexColors.getY(id), vertexColors.getZ(id)));
        }
        color.multiplyScalar(shade);
        if (material instanceof MeshStandardMaterial) color.add(material.emissive.clone().multiplyScalar(material.emissiveIntensity * 0.3));
        faces.push({ points: vertices.map(v => new Vector3(v.dot(right), -v.dot(up), 0)),
          depth: (a.dot(forward) + b.dot(forward) + c.dot(forward)) / 3,
          fill: `#${color.getHexString()}`, opacity: material.opacity });
      }
    }
  }
  return faces;
};

/** Largest |x| or |y| of `root`'s projected drawing about the model origin, in model units. */
export const projectedHalfExtent = (root: Object3D): number =>
  Math.max(...projectedFaces(root).flatMap(face => face.points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))));

/** Deterministic flat-shaded 2D projection of meshes (instanced or not) to a
 * 128x128 SVG, for overlay exports and audits; `root`'s descendants are
 * visited with their world matrices. */
export const projectMeshesToSvg = (root: Object3D, title: string, options: ProjectionOptions = {}): string => {
  const faces = projectedFaces(root);
  const minFaceArea = options.minFaceArea ?? 0;
  if (!faces.length) throw new Error(`No visible geometry for ${title}`);
  const points = faces.flatMap(face => face.points);
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const fixed = options.scale !== undefined;
  const scale = options.scale ?? 112 / Math.max(maxX - minX, maxY - minY);
  const centerX = fixed ? 0 : (minX + maxX) / 2, centerY = fixed ? 0 : (minY + maxY) / 2;
  const project = (p: Vector3): string => `${(64 + (p.x - centerX) * scale).toFixed(1)},${(64 + (p.y - centerY) * scale).toFixed(1)}`;
  const area = (face: Face): number => {
    const [a, b, c] = face.points;
    return a && b && c ? Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) * 0.5 * scale * scale : 0;
  };
  const visible = minFaceArea > 0 ? faces.filter((face) => area(face) >= minFaceArea) : faces;
  visible.sort((a, b) => a.depth - b.depth);
  const paths = visible.map(face => `<path fill="${face.fill}"${face.opacity < 1 ? ` opacity="${face.opacity}"` : ""} d="M${face.points.map(project).join("L")}Z"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>${title}</title>${paths.join("")}</svg>\n`;
};

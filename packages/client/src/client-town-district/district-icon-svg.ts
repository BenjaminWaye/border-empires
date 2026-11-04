import { createDistrictGeometry, type DistrictGeometry } from "./district-geometry.js";
import { DISTRICT_BUILDING_KINDS, type DistrictBuildingKind } from "./district-catalog.js";
export { DISTRICT_BUILDING_KINDS };

// Deterministic vector exports of the production model, viewed from above and
// the front. Tiny subpixel triangles and invisible faces are omitted so mobile
// 2D clients do not download the full mesh as thousands of SVG decorations.
export const districtIconSvg = (kind: DistrictBuildingKind): string => {
  return modelIconSvg(createDistrictGeometry(kind), kind.replaceAll("_", " "));
};

export const modelIconSvg = (geometry: DistrictGeometry, title: string, glassOpacity = 1): string => {
  const faces: Array<{ depth: number; color: string; opacity: number; path: string }> = [];
  for (const [layer, mesh] of Object.entries(geometry.layers)) {
    if (layer === "halo" || layer === "steam") continue;
    const position = mesh.getAttribute("position"), colors = mesh.getAttribute("color");
    const index = mesh.index;
    const count = index?.count ?? position.count;
    for (let n = 0; n < count; n += 3) {
      const vertices = [0, 1, 2].map(offset => {
        const i = index ? index.getX(n + offset) : n + offset;
        return { x: position.getX(i), y: position.getY(i), z: position.getZ(i), r: colors.getX(i), g: colors.getY(i), b: colors.getZ(i) };
      });
      const a = vertices[0], b = vertices[1], c = vertices[2];
      if (!a || !b || !c) continue;
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny * 0.75 + nz < 0) continue;
      const projected = vertices.map(p => [64 + p.x * 146, 78 + p.z * 87 - p.y * 142] as const);
      const p = projected[0], q = projected[1], r = projected[2];
      if (!p || !q || !r || Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) < 0.35) continue;
      const light = layer === "glow" ? 1 : 0.65 + 0.35 * Math.max(0, (-nx * 0.4 + ny * 0.8 + nz * 0.5) / Math.max(1e-8, Math.hypot(nx, ny, nz)));
      const channel = (value: number): number => Math.min(255, Math.max(0, Math.round(Math.pow(Math.max(0, value), 1 / 2.2) * 255 * light / 4) * 4));
      const color = `rgb(${channel((a.r + b.r + c.r) / 3)},${channel((a.g + b.g + c.g) / 3)},${channel((a.b + b.b + c.b) / 3)})`;
      faces.push({ opacity: layer === "glass" ? glassOpacity : 1, depth: (a.z + b.z + c.z + (a.y + b.y + c.y) * 0.75) / 3, color,
        path: `M${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)} ${r[0].toFixed(1)},${r[1].toFixed(1)}Z` });
    }
  }
  for (const mesh of Object.values(geometry.layers)) mesh.dispose();
  faces.sort((a, b) => a.depth - b.depth);
  const paths: string[] = [];
  let color = "", path = "", opacity = 1;
  const flush = (): void => { if (path) paths.push(`<path fill="${color}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""} d="${path}"/>`); };
  for (const face of faces) {
    if (color !== face.color || opacity !== face.opacity) {
      flush();
      color = face.color; opacity = face.opacity; path = face.path;
    } else path += face.path;
  }
  flush();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>${title}</title>${paths.join("")}</svg>\n`;
};

export const districtIconKinds = (): readonly DistrictBuildingKind[] => DISTRICT_BUILDING_KINDS;

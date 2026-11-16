import { BufferGeometry, Float32BufferAttribute } from "three";

// The Survey Quad's upper shell (client-map-3d-scout-drone-geometry.ts): a smooth dome lofted from
// a few cross-sections along the body, each the upper half of a superellipse -- flat-ish sides
// rounding over into a soft ridge. The stations rise toward the rear and middle and slope down to
// the nose, so the side silhouette has a clear front. Smooth normals across the dome; the flat
// underside (where the shell meets the waist seam) and the end caps are separate faces, so the
// only crisp edge is the shell's lower rim. Built once.

/** One cross-section: z along the body, half-width, the ridge height and the rim height. */
export type ShellStation = { z: number; halfWidth: number; top: number; rim: number };

const SEGMENTS = 32; // around the half-section, rim to rim over the top
const STATIONS = 28; // cross-sections along the body after smoothing
const EXPONENT = 2.6; // >2 flattens the sides into a rounded-box dome

// Point `i` of the half-section: from the right rim (i = 0) over the ridge to the left rim.
const sectionPoint = (s: ShellStation, i: number): [number, number] => {
  const t = (i / SEGMENTS) * Math.PI;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  const x = s.halfWidth * Math.sign(c) * Math.abs(c) ** (2 / EXPONENT);
  const y = s.rim + (s.top - s.rim) * Math.abs(sn) ** (2 / EXPONENT);
  return [x, y];
};

// Catmull-Rom through the key stations, so the dome's profile is a smooth curve along its length
// (no visible kinks where a coarse loft would join straight segments), resampled at STATIONS.
const densify = (keys: readonly ShellStation[]): ShellStation[] => {
  const at = (i: number): ShellStation => keys[Math.max(0, Math.min(keys.length - 1, i))]!;
  const spline = (p0: number, p1: number, p2: number, p3: number, t: number): number =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const out: ShellStation[] = [];
  for (let n = 0; n < STATIONS; n += 1) {
    const u = (n / (STATIONS - 1)) * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(u));
    const t = u - i;
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const field = (k: keyof ShellStation): number => spline(a[k], b[k], c[k], d[k], t);
    out.push({ z: field("z"), halfWidth: Math.max(0.004, field("halfWidth")), top: field("top"), rim: field("rim") });
  }
  return out;
};

/** Lofts the dome through `keys` (tail to nose), smoothed, with a flat underside and both end caps. */
export const buildShell = (keys: readonly ShellStation[]): BufferGeometry => {
  const stations = densify(keys);
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = SEGMENTS + 1;
  for (const s of stations) {
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const [x, y] = sectionPoint(s, i);
      positions.push(x, y, s.z);
    }
  }
  // The dome: one smooth indexed sheet, wound so its normals face outward.
  for (let k = 0; k + 1 < stations.length; k += 1) {
    for (let i = 0; i < SEGMENTS; i += 1) {
      const a = k * ring + i;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const dome = new BufferGeometry();
  dome.setAttribute("position", new Float32BufferAttribute(positions, 3));
  dome.setIndex(indices);
  dome.computeVertexNormals();
  // Caps and underside as flat faces, appended non-indexed after the smooth dome.
  const flat: number[] = [];
  const cap = (s: ShellStation, facing: 1 | -1): void => {
    const cy = s.rim;
    for (let i = 0; i < SEGMENTS; i += 1) {
      const [x0, y0] = sectionPoint(s, i);
      const [x1, y1] = sectionPoint(s, i + 1);
      if (facing > 0) flat.push(0, cy, s.z, x0, y0, s.z, x1, y1, s.z);
      else flat.push(0, cy, s.z, x1, y1, s.z, x0, y0, s.z);
    }
  };
  cap(stations[0]!, -1);
  cap(stations[stations.length - 1]!, 1);
  for (let k = 0; k + 1 < stations.length; k += 1) {
    const s0 = stations[k]!;
    const s1 = stations[k + 1]!;
    // Wound to face down.
    flat.push(s0.halfWidth, s0.rim, s0.z, s1.halfWidth, s1.rim, s1.z, -s0.halfWidth, s0.rim, s0.z);
    flat.push(-s0.halfWidth, s0.rim, s0.z, s1.halfWidth, s1.rim, s1.z, -s1.halfWidth, s1.rim, s1.z);
  }
  const caps = new BufferGeometry();
  caps.setAttribute("position", new Float32BufferAttribute(flat, 3));
  caps.computeVertexNormals();
  const smooth = dome.toNonIndexed();
  dome.dispose();
  const merged = new BufferGeometry();
  const sp = smooth.getAttribute("position").array as Float32Array;
  const sn = smooth.getAttribute("normal").array as Float32Array;
  const cp = caps.getAttribute("position").array as Float32Array;
  const cn = caps.getAttribute("normal").array as Float32Array;
  const pos = new Float32Array(sp.length + cp.length);
  const nor = new Float32Array(sn.length + cn.length);
  pos.set(sp);
  pos.set(cp, sp.length);
  nor.set(sn);
  nor.set(cn, sn.length);
  merged.setAttribute("position", new Float32BufferAttribute(pos, 3));
  merged.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  smooth.dispose();
  caps.dispose();
  return merged;
};

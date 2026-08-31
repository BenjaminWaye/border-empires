import {
  BoxGeometry,
  BufferGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  Vector3
} from "three";

// 3D Umbrite deposit overlay — an unnaturally dark mineral vein emerging
// from beneath an ancient forest floor, tightly intertwined with massive
// fossilized roots. The mineral is a fused mass of dense black geological
// material, dark tree resin and glassy metal: near-black on the outside
// with a violet-blue reflective sheen, darker purple-black and slightly
// metallic where faces are broken, with a few sparse glowing orange
// fissures and tiny ember inclusions suggesting enormous stored energy.
// Thick gnarled brown-black roots (bronze/grey flecks) wrap around and
// disappear underneath the formations, so the mineral dominates the centre
// while the roots frame it. Reads as dark purple-black mineral + ancient
// roots + tiny orange energy fissures at gameplay distance, and stays
// distinct from Titanium (silver-grey), Glass Steel (translucent
// blue-green) and ordinary rocks (matte grey/brown). Three variants are
// picked deterministically per tile (same hash approach as the resource
// overlay).

export type UmbriteDepositVariant = 0 | 1 | 2;

export const umbriteDepositVariantAt = (worldX: number, worldZ: number): UmbriteDepositVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as UmbriteDepositVariant;
};

export type UmbriteDepositOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// ─── Root tube geometry ───────────────────────────────────────────────
// A shared, slightly arched tapered tube for each root profile, generated
// once at module init and instanced per tile. The arch rises from ground
// level at both ends (so the tips tuck under the mound) and peaks in the
// middle; radius wobbles and tapers toward the tips, and the vertex
// colours bake in bark brown with scattered bronze/grey flecks.
type RootProfile = { readonly span: number; readonly lift: number; readonly bend: number; readonly baseR: number; readonly seed: number };

const ROOT_PROFILES: ReadonlyArray<RootProfile> = [
  { span: 0.85, lift: 0.16, bend: 0.06, baseR: 0.04, seed: 11 },
  { span: 0.95, lift: 0.24, bend: -0.08, baseR: 0.048, seed: 23 },
  { span: 1.05, lift: 0.11, bend: 0.0, baseR: 0.035, seed: 37 },
  { span: 0.78, lift: 0.2, bend: 0.14, baseR: 0.032, seed: 41 },
  { span: 0.88, lift: 0.27, bend: -0.05, baseR: 0.052, seed: 59 }
];

const rand01 = (k: number): number => {
  const s = Math.sin(k * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const BARK: readonly [number, number, number] = [0.16, 0.13, 0.09];
const BRONZE: readonly [number, number, number] = [0.33, 0.27, 0.17];
const GREY: readonly [number, number, number] = [0.25, 0.25, 0.28];

const makeRootGeometry = (profile: RootProfile): BufferGeometry => {
  const SEGMENTS = 12;
  const RINGS = 8;
  const { span, lift, bend, baseR, seed } = profile;
  const sx = -span / 2;
  const ex = span / 2;
  const cxm = bend * 2;
  const cym = lift * 2;
  const points: Vector3[] = [];
  const tangents: Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const it = 1 - t;
    const x = it * it * sx + 2 * it * t * cxm + t * t * ex;
    const y = 2 * it * t * cym;
    const z = 0;
    points.push(new Vector3(x, y, z));
    const dx = 2 * it * (cxm - sx) + 2 * t * (ex - cxm);
    const dy = 2 * it * cym + 2 * t * -cym;
    tangents.push(new Vector3(dx, dy, 0).normalize());
  }
  const up = new Vector3(0, 1, 0);
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const tangent = tangents[i]!;
    const binormal = new Vector3().crossVectors(up, tangent).normalize();
    const normal = new Vector3().crossVectors(tangent, binormal).normalize();
    const taper = 0.55 + 0.45 * Math.pow(Math.sin(Math.PI * t), 0.6);
    const wobble = 1 + 0.3 * rand01(seed * 7 + i * 3);
    const r = baseR * taper * wobble;
    for (let j = 0; j < RINGS; j += 1) {
      const a = (j / RINGS) * Math.PI * 2;
      const off = new Vector3()
        .addScaledVector(binormal, Math.cos(a) * r)
        .addScaledVector(normal, Math.sin(a) * r);
      const p = points[i]!.clone().add(off);
      vertices.push(p.x, p.y, p.z);
      const fleck = rand01(seed * 13 + i * 5 + j);
      let c: readonly [number, number, number] = BARK;
      if (fleck > 0.88) c = BRONZE;
      else if (fleck > 0.78) c = GREY;
      const shade = 0.85 + 0.3 * rand01(seed * 3 + i * 11 + j);
      colors.push(c[0] * shade, c[1] * shade, c[2] * shade);
    }
  }
  for (let i = 0; i < SEGMENTS; i += 1) {
    for (let j = 0; j < RINGS; j += 1) {
      const a = i * RINGS + j;
      const b = i * RINGS + ((j + 1) % RINGS);
      const c = (i + 1) * RINGS + j;
      const d = (i + 1) * RINGS + ((j + 1) % RINGS);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const createUmbriteDepositOverlay = (scene: Scene, maxTiles: number): UmbriteDepositOverlay => {
  // ─── Materials (shared by piece type) ───────────────────────────────
  const soilMaterial = new MeshStandardMaterial({ color: "#1c1611", roughness: 1.0, metalness: 0, flatShading: true });
  // Outer umbrite: dense near-black charcoal with a faint violet glow so
  // shadowed facets never collapse to pure black, and enough metalness to
  // catch a glassy glint from the key light.
  const bodyMaterial = new MeshStandardMaterial({
    color: "#0b0911",
    roughness: 0.42,
    metalness: 0.45,
    flatShading: true,
    emissive: "#251a4e",
    emissiveIntensity: 0.36
  });
  // Violet-blue reflective sheen surfaces — lower roughness, higher
  // metalness, stronger violet emissive so the mineral reads as
  // glassy/metallic, not coal.
  const sheenMaterial = new MeshStandardMaterial({
    color: "#171125",
    roughness: 0.16,
    metalness: 0.8,
    flatShading: true,
    emissive: "#472a96",
    emissiveIntensity: 0.44
  });
  // Broken faces: dark translucent purple-black interior with subtle
  // metallic reflection.
  const brokenMaterial = new MeshStandardMaterial({
    color: "#27143f",
    roughness: 0.3,
    metalness: 0.72,
    flatShading: true,
    emissive: "#55268c",
    emissiveIntensity: 0.42
  });
  // Glowing orange fissures — restrained emissive, reads as heat escaping.
  const fissureMaterial = new MeshStandardMaterial({
    color: "#331304",
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ff7720",
    emissiveIntensity: 2.6
  });
  // Tiny ember inclusions embedded in the mineral.
  const emberMaterial = new MeshStandardMaterial({
    color: "#260d05",
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
    emissive: "#ff9434",
    emissiveIntensity: 2.0
  });
  // Fossilized root bark — vertex-coloured, so the material base is white.
  const rootMaterial = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, metalness: 0.06, flatShading: true, vertexColors: true });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const soilGeo = new IcosahedronGeometry(0.16, 0);
  const bodyGeo = new IcosahedronGeometry(0.16, 0);
  const brokenGeo = new OctahedronGeometry(0.16, 0);
  const fissureGeo = new BoxGeometry(0.024, 0.016, 0.16);
  const fissureShortGeo = new BoxGeometry(0.022, 0.014, 0.09);
  const emberGeo = new OctahedronGeometry(0.034, 0);
  const rootGeos: BufferGeometry[] = ROOT_PROFILES.map((p) => makeRootGeometry(p));

  // ─── InstancedMesh registry ────────────────────────────────────────
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();

  const make = (key: string, geo: BufferGeometry, mat: MeshStandardMaterial, cap: number): Slot => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const slot: Slot = { mesh, count: 0, cap };
    slots.set(key, slot);
    return slot;
  };

  const C = maxTiles;
  make("soil", soilGeo, soilMaterial, C * 3);
  make("body", bodyGeo, bodyMaterial, C * 3);
  make("sheen", bodyGeo, sheenMaterial, C * 3);
  make("broken", brokenGeo, brokenMaterial, C * 2);
  make("fissure", fissureGeo, fissureMaterial, C * 4);
  make("fissureShort", fissureShortGeo, fissureMaterial, C * 3);
  make("ember", emberGeo, emberMaterial, C * 6);
  rootGeos.forEach((geo, i) => make(`root${i}`, geo, rootMaterial, C));

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  // Overall deposit model is scaled down 25% from its original design size.
  const DEPOSIT_SCALE = 0.75;

  const addPiece = (
    key: string,
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sz = 1,
    sy2 = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(wx + ox * DEPOSIT_SCALE, sy + oy * DEPOSIT_SCALE, wz + oz * DEPOSIT_SCALE);
    scale.set(sx * DEPOSIT_SCALE, sy2 * DEPOSIT_SCALE, sz * DEPOSIT_SCALE);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  // ─── Soil mound ─────────────────────────────────────────────────────
  type Lump = { readonly x: number; readonly z: number; readonly sx: number; readonly sy: number; readonly rotY: number };
  const OUTCROP: ReadonlyArray<Lump> = [
    { x: 0.02, z: 0.0, sx: 1.6, sy: 0.32, rotY: 0.5 },
    { x: -0.16, z: 0.14, sx: 1.1, sy: 0.26, rotY: 1.6 },
    { x: 0.18, z: -0.12, sx: 1.05, sy: 0.26, rotY: 2.9 }
  ];

  const surfaceHeightAt = (ox: number, oz: number): number => {
    let height = 0;
    for (const lump of OUTCROP) {
      const dx = ox - lump.x;
      const dz = oz - lump.z;
      const R = 0.16 * lump.sx;
      const d2 = dx * dx + dz * dz;
      const cy = 0.16 * lump.sx * lump.sy + 0.01;
      height = Math.max(height, d2 < R * R ? cy + lump.sy * Math.sqrt(R * R - d2) : cy);
    }
    return height;
  };

  const addSoil = (wx: number, sy: number, wz: number): void => {
    OUTCROP.forEach((lump) => {
      const cy = 0.16 * lump.sx * lump.sy + 0.01;
      addPiece("soil", wx, sy, wz, lump.x, cy, lump.z, lump.sx, lump.sx, lump.sy, lump.rotY);
    });
  };

  // ─── Placement ─────────────────────────────────────────────────────
  // Fissures and embers are attached to a chunk and positioned on its
  // outer surface (side + height fraction), offset just far enough to
  // clear the faceted mineral so they never get buried inside it.
  const SIDE: Record<"front" | "left" | "right" | "back", readonly [number, number]> = {
    front: [0, 1],
    left: [-1, 0],
    right: [1, 0],
    back: [0, -1]
  };

  type Chunk = { readonly ox: number; readonly oz: number; readonly sx: number; readonly sy: number; readonly sz: number; readonly mat: "body" | "sheen" | "broken"; readonly rotY: number };
  type Fissure = { readonly chunk: number; readonly frac: number; readonly side: keyof typeof SIDE; readonly short?: boolean };
  type Ember = { readonly chunk: number; readonly frac: number; readonly side: keyof typeof SIDE; readonly scale: number };
  type Root = { readonly root: number; readonly ox: number; readonly oz: number; readonly rotY: number; readonly scale: number };
  type Formation = {
    readonly chunks: ReadonlyArray<Chunk>;
    readonly broken: ReadonlyArray<Chunk>;
    readonly fissures: ReadonlyArray<Fissure>;
    readonly embers: ReadonlyArray<Ember>;
    readonly roots: ReadonlyArray<Root>;
  };

  const placeChunk = (wx: number, sy: number, wz: number, c: Chunk, mat: "body" | "sheen" | "broken"): void => {
    const surf = surfaceHeightAt(c.ox, c.oz);
    addPiece(mat, wx, sy, wz, c.ox, surf + 0.1 * c.sy - (mat === "broken" ? 0.045 : 0.05), c.oz, c.sx, c.sz, c.sy, c.rotY);
  };

  const placeFissure = (wx: number, sy: number, wz: number, c: Chunk, f: Fissure): void => {
    const surf = surfaceHeightAt(c.ox, c.oz);
    const centerY = surf + 0.1 * c.sy - 0.05;
    const R = 0.16 * c.sx;
    const [dx, dz] = SIDE[f.side];
    const px = c.ox + dx * (R + 0.028);
    const pz = c.oz + dz * (R + 0.028);
    const py = centerY + 0.16 * c.sy * f.frac;
    addPiece(f.short === true ? "fissureShort" : "fissure", wx, sy, wz, px, py - sy, pz, 1, 1, 1, 0, 1.05, 0);
  };

  const placeEmber = (wx: number, sy: number, wz: number, c: Chunk, e: Ember): void => {
    const surf = surfaceHeightAt(c.ox, c.oz);
    const centerY = surf + 0.1 * c.sy - 0.05;
    const R = 0.16 * c.sx;
    const [dx, dz] = SIDE[e.side];
    const px = c.ox + dx * (R * 0.55 + 0.03);
    const pz = c.oz + dz * (R * 0.55 + 0.03);
    const py = centerY + 0.16 * c.sy * e.frac;
    addPiece("ember", wx, sy, wz, px, py - sy, pz, 0.8, 0.8, e.scale);
  };

  const placeRoot = (wx: number, sy: number, wz: number, r: Root): void => {
    const surf = surfaceHeightAt(r.ox, r.oz);
    addPiece(`root${r.root}`, wx, sy, wz, r.ox, surf, r.oz, r.scale, r.scale, r.scale, r.rotY);
  };

  const addDeposit = (wx: number, sy: number, wz: number, v: UmbriteDepositVariant): void => {
    addSoil(wx, sy, wz);

    const formation: Formation =
      v === 0
        ? {
            chunks: [
              { ox: 0.0, oz: 0.02, sx: 0.7, sy: 2.3, sz: 0.65, mat: "body", rotY: 0.7 },
              { ox: -0.13, oz: -0.08, sx: 0.64, sy: 1.8, sz: 0.64, mat: "sheen", rotY: 2.4 },
              { ox: 0.15, oz: 0.05, sx: 0.62, sy: 1.6, sz: 0.62, mat: "sheen", rotY: 4.1 },
              { ox: -0.18, oz: 0.14, sx: 0.56, sy: 1.45, sz: 0.56, mat: "body", rotY: 3.3 }
            ],
            broken: [{ ox: 0.06, oz: 0.17, sx: 0.5, sy: 1.15, sz: 0.5, mat: "broken", rotY: 5.2 }],
            fissures: [
              { chunk: 0, frac: 0.3, side: "front" },
              { chunk: 0, frac: 0.08, side: "front", short: true },
              { chunk: 2, frac: 0.3, side: "front", short: true },
              { chunk: 3, frac: 0.28, side: "front", short: true }
            ],
            embers: [
              { chunk: 0, frac: -0.15, side: "front", scale: 1.2 },
              { chunk: 0, frac: 0.05, side: "left", scale: 0.9 },
              { chunk: 1, frac: 0.0, side: "front", scale: 0.9 },
              { chunk: 2, frac: -0.1, side: "front", scale: 1.0 },
              { chunk: 2, frac: 0.05, side: "right", scale: 0.8 }
            ],
            roots: [
              { root: 1, ox: 0.0, oz: 0.02, rotY: 0.5, scale: 1.15 },
              { root: 0, ox: -0.12, oz: 0.1, rotY: 2.6, scale: 1.0 },
              { root: 2, ox: 0.14, oz: -0.1, rotY: 4.3, scale: 1.1 }
            ]
          }
        : v === 1
          ? {
              chunks: [
                { ox: -0.06, oz: 0.0, sx: 0.8, sy: 1.55, sz: 0.62, mat: "body", rotY: 0.9 },
                { ox: 0.16, oz: 0.03, sx: 0.65, sy: 1.35, sz: 0.6, mat: "sheen", rotY: 2.8 },
                { ox: -0.22, oz: 0.07, sx: 0.6, sy: 1.3, sz: 0.55, mat: "body", rotY: 4.5 },
                { ox: 0.0, oz: -0.16, sx: 0.6, sy: 1.2, sz: 0.55, mat: "body", rotY: 5.7 }
              ],
              broken: [{ ox: -0.14, oz: 0.2, sx: 0.5, sy: 1.05, sz: 0.5, mat: "broken", rotY: 1.7 }],
              fissures: [
                { chunk: 0, frac: 0.3, side: "front" },
                { chunk: 1, frac: 0.25, side: "front", short: true },
                { chunk: 2, frac: 0.25, side: "front", short: true },
                { chunk: 3, frac: 0.25, side: "back", short: true }
              ],
              embers: [
                { chunk: 0, frac: 0.05, side: "front", scale: 1.1 },
                { chunk: 1, frac: -0.05, side: "front", scale: 0.9 },
                { chunk: 2, frac: 0.0, side: "front", scale: 0.85 },
                { chunk: 3, frac: -0.1, side: "left", scale: 0.9 }
              ],
              roots: [
                { root: 2, ox: 0.0, oz: 0.04, rotY: 1.0, scale: 1.25 },
                { root: 1, ox: -0.1, oz: -0.12, rotY: 3.4, scale: 1.05 },
                { root: 4, ox: 0.08, oz: 0.1, rotY: 5.0, scale: 0.9 },
                { root: 0, ox: 0.16, oz: -0.14, rotY: 0.2, scale: 0.85 }
              ]
            }
          : {
              chunks: [
                { ox: 0.0, oz: 0.0, sx: 0.68, sy: 2.4, sz: 0.62, mat: "sheen", rotY: 0.4 },
                { ox: -0.14, oz: -0.06, sx: 0.64, sy: 1.85, sz: 0.6, mat: "body", rotY: 2.1 },
                { ox: 0.14, oz: 0.08, sx: 0.6, sy: 1.5, sz: 0.6, mat: "body", rotY: 4.0 },
                { ox: -0.2, oz: 0.11, sx: 0.55, sy: 1.25, sz: 0.55, mat: "body", rotY: 3.4 }
              ],
              broken: [{ ox: 0.08, oz: 0.18, sx: 0.55, sy: 1.15, sz: 0.55, mat: "broken", rotY: 5.5 }],
              fissures: [
                { chunk: 0, frac: 0.35, side: "front" },
                { chunk: 0, frac: 0.12, side: "front", short: true },
                { chunk: 1, frac: 0.28, side: "front", short: true },
                { chunk: 2, frac: 0.28, side: "front", short: true }
              ],
              embers: [
                { chunk: 0, frac: -0.1, side: "front", scale: 1.3 },
                { chunk: 0, frac: 0.05, side: "right", scale: 0.9 },
                { chunk: 1, frac: 0.0, side: "front", scale: 0.9 },
                { chunk: 2, frac: 0.0, side: "front", scale: 1.0 }
              ],
              roots: [
                { root: 4, ox: 0.0, oz: -0.02, rotY: 0.6, scale: 1.1 },
                { root: 3, ox: -0.14, oz: 0.12, rotY: 2.2, scale: 1.05 },
                { root: 1, ox: 0.12, oz: 0.14, rotY: 3.9, scale: 0.95 },
                { root: 2, ox: -0.1, oz: -0.16, rotY: 5.3, scale: 1.0 }
              ]
            };

    formation.chunks.forEach((c) => placeChunk(wx, sy, wz, c, c.mat));
    formation.broken.forEach((c) => placeChunk(wx, sy, wz, c, "broken"));
    formation.fissures.forEach((f) => placeFissure(wx, sy, wz, formation.chunks[f.chunk]!, f));
    formation.embers.forEach((e) => placeEmber(wx, sy, wz, formation.chunks[e.chunk]!, e));
    formation.roots.forEach((r) => placeRoot(wx, sy, wz, r));
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    const v = umbriteDepositVariantAt(worldTileX, worldTileY);
    addDeposit(sceneX, surfaceY, sceneZ, v);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      const { mesh, count } = slot;
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [soilGeo, bodyGeo, brokenGeo, fissureGeo, fissureShortGeo, emberGeo, ...rootGeos].forEach((g) => g.dispose());
    [soilMaterial, bodyMaterial, sheenMaterial, brokenMaterial, fissureMaterial, emberMaterial, rootMaterial].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};

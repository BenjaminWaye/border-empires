import {
  BoxGeometry,
  BufferGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  Vector3
} from "three";

// 3D titanium deposit overlay — a low, irregular outcrop of dark
// gunmetal/charcoal bedrock with bright silvery-metallic titanium ore
// breaking through it. Reads as a natural mineral outcropping, not loose
// ore blocks or manufactured works: angular metallic chunks and flat
// fractured ore plates protrude upward (tallest near the centre), thin
// cool-grey veins cross the rock, a few small crystals and loose
// fragments scatter around the base, and the whole layout is deliberately
// asymmetric so the deposit stays readable from every side. The matte
// dark bedrock is contrasted against near-white, highly reflective
// titanium (low roughness, full metalness) so the asset pops at gameplay
// distance. Three variants are picked deterministically per tile (same
// hash approach as the resource overlay).

export type TitaniumDepositVariant = 0 | 1 | 2;

export const titaniumDepositVariantAt = (worldX: number, worldZ: number): TitaniumDepositVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (402653189 * 1442695041)) >>> 0;
  return (h % 3) as TitaniumDepositVariant;
};

export type TitaniumDepositOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTitaniumDepositOverlay = (scene: Scene, maxTiles: number): TitaniumDepositOverlay => {
  // ─── Materials (shared by piece type) ───────────────────────────────
  // Matte dark gunmetal/charcoal bedrock — the surrounding rock the ore
  // breaks out of. Low metalness, high roughness, flat-shaded facets.
  const bedrockDarkMaterial = new MeshStandardMaterial({ color: "#2b2c30", roughness: 0.92, metalness: 0.1, flatShading: true });
  const bedrockLightMaterial = new MeshStandardMaterial({ color: "#41434a", roughness: 0.88, metalness: 0.15, flatShading: true });
  // Bright polished titanium. Near-white with full metalness and almost no
  // roughness so each flat facet reflects the key light as a hard glint;
  // a faint cool emissive keeps shadowed facets from going black.
  const titaniumBrightMaterial = new MeshStandardMaterial({
    color: "#eef2f6",
    roughness: 0.12,
    metalness: 1.0,
    flatShading: true,
    emissive: "#0d1620",
    emissiveIntensity: 0.18
  });
  const titaniumMidMaterial = new MeshStandardMaterial({
    color: "#c2ccd8",
    roughness: 0.2,
    metalness: 0.95,
    flatShading: true,
    emissive: "#0d1620",
    emissiveIntensity: 0.12
  });
  const titaniumDarkMaterial = new MeshStandardMaterial({
    color: "#8b95a3",
    roughness: 0.3,
    metalness: 0.9,
    flatShading: true
  });
  // Cool blue-grey highlight for mineral veins and crystal edges.
  const veinMaterial = new MeshStandardMaterial({
    color: "#dfe9f3",
    roughness: 0.08,
    metalness: 1.0,
    flatShading: true,
    emissive: "#10202c",
    emissiveIntensity: 0.25
  });

  // ─── Geometries (shared) ────────────────────────────────────────────
  // 0-subdivision icosahedra = 20 flat triangular facets, so every chunk
  // reads as chunky low-poly rock with broad specular faces.
  const bedrockGeo = new IcosahedronGeometry(0.16, 0);
  const oreGeo = new IcosahedronGeometry(0.1, 0);
  const plateGeo = new IcosahedronGeometry(0.18, 0);
  const crystalGeo = new OctahedronGeometry(0.08, 0);
  const veinGeo = new BoxGeometry(0.025, 0.02, 0.16);
  const chunkGeo = new IcosahedronGeometry(0.05, 0);

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
  make("bedrockDark", bedrockGeo, bedrockDarkMaterial, C * 6);
  make("bedrockLight", bedrockGeo, bedrockLightMaterial, C * 4);
  make("oreBright", oreGeo, titaniumBrightMaterial, C * 5);
  make("oreMid", oreGeo, titaniumMidMaterial, C * 5);
  make("oreDark", oreGeo, titaniumDarkMaterial, C * 4);
  make("plate", plateGeo, titaniumBrightMaterial, C * 4);
  make("crystal", crystalGeo, veinMaterial, C * 4);
  make("vein", veinGeo, veinMaterial, C * 6);
  make("chunkBright", chunkGeo, titaniumBrightMaterial, C * 6);
  make("chunkDark", chunkGeo, bedrockLightMaterial, C * 5);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

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
    position.set(wx + ox, sy + oy, wz + oz);
    scale.set(sx, sy2, sz);
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

  // ─── Bedrock outcrop ───────────────────────────────────────────────
  // The low irregular mound: a handful of overlapping squashed bedrock
  // lumps, placed asymmetrically so the silhouette differs from every
  // side. `surfaceHeightAt` samples this outcrop so the ore pieces embed
  // into the actual rock surface instead of floating.
  type Lump = { readonly x: number; readonly z: number; readonly sx: number; readonly sy: number; readonly rotY: number };
  const OUTCROP: ReadonlyArray<Lump> = [
    { x: 0.0, z: 0.0, sx: 1.3, sy: 0.62, rotY: 0.5 },
    { x: -0.24, z: -0.16, sx: 0.8, sy: 0.5, rotY: 1.4 },
    { x: 0.28, z: 0.1, sx: 0.9, sy: 0.45, rotY: 2.6 },
    { x: -0.2, z: 0.2, sx: 0.62, sy: 0.42, rotY: 3.9 },
    { x: 0.18, z: -0.22, sx: 0.6, sy: 0.4, rotY: 5.2 }
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

  const addBedrock = (wx: number, sy: number, wz: number): void => {
    OUTCROP.forEach((lump, i) => {
      const cy = 0.16 * lump.sx * lump.sy + 0.01;
      addPiece(i % 2 === 0 ? "bedrockDark" : "bedrockLight", wx, sy, wz, lump.x, cy, lump.z, lump.sx, lump.sx, lump.sy, lump.rotY);
    });
  };

  // ─── Ore placement ─────────────────────────────────────────────────
  type Chunk = { readonly ox: number; readonly oz: number; readonly sx: number; readonly sy: number; readonly sz: number; readonly mat: "oreBright" | "oreMid" | "oreDark"; readonly rotY: number };
  type Plate = { readonly ox: number; readonly oz: number; readonly sx: number; readonly sz: number; readonly rotY: number; readonly tilt: number; readonly mat: "oreBright" | "oreMid" };
  type Crystal = { readonly ox: number; readonly oz: number; readonly sy: number };
  type Vein = { readonly ox: number; readonly oz: number; readonly rotY: number };
  type Loose = { readonly ox: number; readonly oz: number; readonly mat: "chunkBright" | "chunkDark"; readonly rotY: number };

  // A large angular ore chunk protruding up out of the rock — the base is
  // sunk into the outcrop surface so it reads as having broken through.
  const placeChunk = (wx: number, sy: number, wz: number, c: Chunk): void => {
    const surf = surfaceHeightAt(c.ox, c.oz);
    const centerY = surf + 0.1 * c.sy - 0.05;
    addPiece(c.mat, wx, sy, wz, c.ox, centerY, c.oz, c.sx, c.sz, c.sy, c.rotY);
  };

  // A flat, fractured ore plate thrust up at an angle out of the rock.
  const placePlate = (wx: number, sy: number, wz: number, p: Plate): void => {
    const surf = surfaceHeightAt(p.ox, p.oz);
    addPiece(p.mat, wx, sy, wz, p.ox, surf + 0.06, p.oz, p.sx, p.sz, 0.18, p.rotY, 0, p.tilt);
  };

  // A small sharp metallic crystal rising out of the rock.
  const placeCrystal = (wx: number, sy: number, wz: number, c: Crystal): void => {
    const surf = surfaceHeightAt(c.ox, c.oz);
    const centerY = surf + 0.08 * c.sy - 0.03;
    addPiece("crystal", wx, sy, wz, c.ox, centerY, c.oz, 0.5, 0.5, c.sy, c.ox * 7, 0, 0.12);
  };

  // A thin cool-grey mineral vein crossing the rock surface.
  const placeVein = (wx: number, sy: number, wz: number, v: Vein): void => {
    const surf = surfaceHeightAt(v.ox, v.oz);
    addPiece("vein", wx, sy, wz, v.ox, surf + 0.006, v.oz, 1, 1, 1, v.rotY, 0, 0);
  };

  const placeLoose = (wx: number, sy: number, wz: number, l: Loose): void => {
    const surf = surfaceHeightAt(l.ox, l.oz);
    addPiece(l.mat, wx, sy, wz, l.ox, surf + 0.03, l.oz, 1, 1, 1, l.rotY);
  };

  const addDeposit = (wx: number, sy: number, wz: number, v: TitaniumDepositVariant): void => {
    addBedrock(wx, sy, wz);

    const chunks: ReadonlyArray<Chunk> =
      v === 0
        ? [
            { ox: 0.03, oz: 0.02, sx: 0.95, sy: 1.9, sz: 0.9, mat: "oreBright", rotY: 0.6 },
            { ox: -0.11, oz: -0.06, sx: 0.8, sy: 1.5, sz: 0.75, mat: "oreMid", rotY: 2.2 },
            { ox: 0.15, oz: 0.06, sx: 0.7, sy: 1.3, sz: 0.7, mat: "oreDark", rotY: 4.1 },
            { ox: -0.2, oz: 0.08, sx: 0.6, sy: 1.1, sz: 0.6, mat: "oreMid", rotY: 3.3 }
          ]
        : v === 1
          ? [
              { ox: -0.07, oz: -0.05, sx: 0.9, sy: 1.7, sz: 0.85, mat: "oreBright", rotY: 0.9 },
              { ox: 0.09, oz: -0.07, sx: 0.85, sy: 1.6, sz: 0.8, mat: "oreMid", rotY: 2.7 },
              { ox: 0.0, oz: 0.07, sx: 0.7, sy: 1.3, sz: 0.65, mat: "oreDark", rotY: 4.4 },
              { ox: 0.2, oz: 0.1, sx: 0.6, sy: 1.1, sz: 0.6, mat: "oreMid", rotY: 5.6 },
              { ox: -0.2, oz: 0.1, sx: 0.55, sy: 1.0, sz: 0.55, mat: "oreDark", rotY: 1.8 }
            ]
          : [
              { ox: 0.04, oz: 0.0, sx: 0.85, sy: 1.5, sz: 0.8, mat: "oreBright", rotY: 1.2 },
              { ox: -0.14, oz: -0.04, sx: 0.65, sy: 1.15, sz: 0.65, mat: "oreMid", rotY: 3.0 },
              { ox: 0.16, oz: 0.08, sx: 0.6, sy: 1.05, sz: 0.6, mat: "oreDark", rotY: 4.9 }
            ];

    const plates: ReadonlyArray<Plate> =
      v === 0
        ? [
            { ox: -0.06, oz: 0.16, sx: 1.5, sz: 0.9, rotY: 1.9, tilt: 0.7, mat: "oreBright" },
            { ox: 0.12, oz: -0.14, sx: 1.2, sz: 0.8, rotY: 0.6, tilt: -0.5, mat: "oreMid" }
          ]
        : v === 1
          ? [
              { ox: -0.14, oz: 0.12, sx: 1.3, sz: 0.8, rotY: 2.4, tilt: 0.6, mat: "oreBright" },
              { ox: 0.16, oz: -0.12, sx: 1.1, sz: 0.75, rotY: 5.3, tilt: -0.55, mat: "oreMid" }
            ]
          : [
              { ox: -0.08, oz: -0.16, sx: 1.4, sz: 0.9, rotY: 0.3, tilt: 0.55, mat: "oreBright" },
              { ox: 0.1, oz: 0.14, sx: 1.5, sz: 0.85, rotY: 1.4, tilt: -0.7, mat: "oreBright" },
              { ox: -0.18, oz: 0.12, sx: 1.0, sz: 0.7, rotY: 2.6, tilt: 0.5, mat: "oreMid" },
              { ox: 0.2, oz: -0.1, sx: 1.1, sz: 0.75, rotY: 4.4, tilt: -0.5, mat: "oreMid" }
            ];

    const crystals: ReadonlyArray<Crystal> =
      v === 0
        ? [
            { ox: -0.18, oz: -0.14, sy: 1.4 },
            { ox: 0.06, oz: 0.2, sy: 1.1 }
          ]
        : v === 1
          ? [
              { ox: 0.12, oz: 0.18, sy: 1.2 },
              { ox: -0.16, oz: -0.16, sy: 1.3 }
            ]
          : [
              { ox: -0.22, oz: -0.08, sy: 1.1 },
              { ox: 0.08, oz: 0.2, sy: 1.0 },
              { ox: 0.24, oz: 0.02, sy: 0.9 }
            ];

    const veins: ReadonlyArray<Vein> =
      v === 0
        ? [
            { ox: 0.05, oz: -0.1, rotY: 0.4 },
            { ox: -0.12, oz: 0.14, rotY: 1.9 },
            { ox: 0.14, oz: 0.0, rotY: 3.1 }
          ]
        : v === 1
          ? [
              { ox: -0.04, oz: -0.12, rotY: 0.7 },
              { ox: 0.1, oz: 0.14, rotY: 2.3 },
              { ox: -0.14, oz: 0.02, rotY: 4.6 }
            ]
          : [
              { ox: 0.0, oz: -0.08, rotY: 0.5 },
              { ox: -0.08, oz: 0.16, rotY: 1.8 },
              { ox: 0.12, oz: -0.12, rotY: 2.9 },
              { ox: -0.2, oz: 0.0, rotY: 4.2 },
              { ox: 0.2, oz: 0.12, rotY: 5.4 }
            ];

    const loose: ReadonlyArray<Loose> =
      v === 0
        ? [
            { ox: -0.3, oz: -0.08, mat: "chunkBright", rotY: 1.0 },
            { ox: 0.28, oz: -0.02, mat: "chunkDark", rotY: 2.7 },
            { ox: 0.22, oz: 0.2, mat: "chunkBright", rotY: 4.3 },
            { ox: -0.24, oz: 0.22, mat: "chunkDark", rotY: 0.3 }
          ]
        : v === 1
          ? [
              { ox: -0.28, oz: 0.12, mat: "chunkDark", rotY: 1.4 },
              { ox: 0.28, oz: 0.1, mat: "chunkBright", rotY: 3.8 },
              { ox: 0.24, oz: -0.2, mat: "chunkBright", rotY: 0.6 },
              { ox: -0.24, oz: -0.16, mat: "chunkDark", rotY: 5.0 },
              { ox: 0.0, oz: -0.28, mat: "chunkBright", rotY: 2.1 }
            ]
          : [
              { ox: -0.3, oz: 0.08, mat: "chunkDark", rotY: 1.7 },
              { ox: 0.3, oz: -0.06, mat: "chunkBright", rotY: 3.5 },
              { ox: 0.26, oz: 0.2, mat: "chunkDark", rotY: 0.4 },
              { ox: -0.26, oz: -0.18, mat: "chunkBright", rotY: 4.8 }
            ];

    chunks.forEach((c) => placeChunk(wx, sy, wz, c));
    plates.forEach((p) => placePlate(wx, sy, wz, p));
    crystals.forEach((c) => placeCrystal(wx, sy, wz, c));
    veins.forEach((n) => placeVein(wx, sy, wz, n));
    loose.forEach((l) => placeLoose(wx, sy, wz, l));
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    const v = titaniumDepositVariantAt(worldTileX, worldTileY);
    addDeposit(sceneX, surfaceY, sceneZ, v);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [bedrockGeo, oreGeo, plateGeo, crystalGeo, veinGeo, chunkGeo].forEach((g) => g.dispose());
    [
      bedrockDarkMaterial,
      bedrockLightMaterial,
      titaniumBrightMaterial,
      titaniumMidMaterial,
      titaniumDarkMaterial,
      veinMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};

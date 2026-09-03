import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  Vector3
} from "three";

// 3D dock overlay — an ocean transport hub, not a fortification. A heavy
// timber-and-iron pier runs from a compact industrial shore building out
// toward the adjacent water (modelled along +z; the whole rig is rotated at
// render time so +z faces the sea). The hero feature is a large brass cargo
// crane: a tall tapered mast on a plinth, a jib reaching out over the pier,
// a counterweight jib over the shore, and a chain hanging from the jib tip
// that visibly suspends a cargo crate above the deck. The shore end holds a
// dockhouse (door, amber windows, chimney), a steam boiler + winch with a
// brass drum and gear, and a pipe run with a pressure valve. Crates and
// barrels wait on the deck, mooring posts with chains tie off a small
// steampunk cargo barge (iron hull, wood deck, cabin, funnel, cargo), and a
// few small amber lamps dot the pier and the dockhouse. No guns, walls, or
// warships.

const PIO2 = Math.PI / 2;

const tileHash = (worldX: number, worldZ: number, salt: number, mod: number): number => {
  const h = ((worldX * 73856093) ^ (worldZ * 19349663) ^ (salt * 83492791)) >>> 0;
  return h % mod;
};

// Transform that orients a +Y cylinder from point a to point b (used for
// crane rigging, chains and tie rods). Euler order YXZ keeps the two-angle
// solve simple; single-axis rotations are unaffected by the order.
const between = (
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): { readonly cx: number; readonly cy: number; readonly cz: number; readonly sy: number; readonly rx: number; readonly ry: number } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return {
    cx: (a[0] + b[0]) / 2,
    cy: (a[1] + b[1]) / 2,
    cz: (a[2] + b[2]) / 2,
    sy: len,
    rx: Math.acos(Math.min(1, Math.max(-1, dy / len))),
    ry: Math.atan2(dx, dz)
  };
};

export type DockOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    /** Rotation in radians. The dock is modelled facing +z (south); pass
     *  the angle that turns +z toward the adjacent water tile. */
    rotationY: number,
    worldX: number,
    worldZ: number
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// One InstancedMesh per shared (geometry, material) combo. Each slot must be
// able to hold every part of one dock for every one of the `maxTiles` dock
// tiles the renderer may show at once, so capacity is maxTiles * partsPerTile
// per slot (64 parts total per dock). This is the same worst-case contract the
// old overlay used (maxTiles * 12 per mesh) but with exact per-slot counts, so
// total preallocation stays below the previous implementation.
const SLOT = {
  deck: 0,
  plank: 1,
  pile: 2,
  ironBox: 3,
  greyBox: 4,
  brassBox: 5,
  cargoBox: 6,
  doorBox: 7,
  glassBox: 8,
  glowBox: 9,
  pedestal: 10,
  mast: 11,
  brassCone: 12,
  ironRod: 13,
  mooring: 14,
  lamp: 15,
  wheel: 16,
  drum: 17,
  gear: 18,
  gauge: 19,
  tank: 20,
  pipe: 21,
  barrel: 22,
  cap: 23
} as const;

// Parts emitted per dock tile, indexed by SLOT. Each slot's InstancedMesh is
// sized maxTiles * perTile so a full screen of dock tiles can never drop parts.
const PARTS_PER_TILE: ReadonlyArray<number> = [
  2, 3, 6, 6, 4, 5, 5, 1, 1, 5, 1, 2, 2, 5, 2, 3, 1, 1, 1, 1, 2, 2, 2, 1
];

export const createDockOverlay = (scene: Scene, maxTiles: number): DockOverlay => {
  const group = new Group();
  group.name = "dock-overlay";
  scene.add(group);

  const deckWood = new MeshStandardMaterial({ color: "#6b4e33", roughness: 0.9, metalness: 0, flatShading: true });
  const plankWood = new MeshStandardMaterial({ color: "#7c5a39", roughness: 0.9, metalness: 0, flatShading: true });
  const postTimber = new MeshStandardMaterial({ color: "#4a3524", roughness: 0.92, metalness: 0, flatShading: true });
  const iron = new MeshStandardMaterial({ color: "#2a2826", roughness: 0.7, metalness: 0.5, flatShading: true });
  const grey = new MeshStandardMaterial({ color: "#4a4642", roughness: 0.85, metalness: 0.2, flatShading: true });
  const brass = new MeshStandardMaterial({ color: "#7d6a41", roughness: 0.42, metalness: 0.85, flatShading: true });
  const cargoWood = new MeshStandardMaterial({ color: "#8a6a45", roughness: 0.84, metalness: 0, flatShading: true });
  const barrelWood = new MeshStandardMaterial({ color: "#7a553a", roughness: 0.86, metalness: 0, flatShading: true });
  const glow = new MeshStandardMaterial({ color: "#ff7a2a", roughness: 0.4, metalness: 0, flatShading: true, emissive: "#ff5318", emissiveIntensity: 0.85 });
  const glass = new MeshStandardMaterial({ color: "#3a4048", roughness: 0.35, metalness: 0.4, flatShading: true });

  const boxGeo = new BoxGeometry(1, 1, 1);
  const pileGeo = new CylinderGeometry(0.026, 0.032, 1, 7);
  const pedestalGeo = new CylinderGeometry(0.08, 0.1, 1, 10);
  const mastGeo = new CylinderGeometry(0.05, 0.06, 1, 10);
  const brassConeGeo = new ConeGeometry(0.06, 1, 8);
  const greyConeGeo = new ConeGeometry(0.045, 1, 8);
  const rodGeo = new CylinderGeometry(0.012, 0.012, 1, 6);
  const mooringGeo = new CylinderGeometry(0.025, 0.03, 1, 8);
  const lampGeo = new CylinderGeometry(0.008, 0.012, 1, 6);
  const wheelGeo = new CylinderGeometry(0.025, 0.025, 1, 10);
  const drumGeo = new CylinderGeometry(0.04, 0.04, 1, 12);
  const gearGeo = new CylinderGeometry(0.06, 0.06, 1, 12);
  const gaugeGeo = new CylinderGeometry(0.02, 0.02, 1, 8);
  const tankGeo = new CylinderGeometry(0.05, 0.05, 1, 10);
  const pipeGeo = new CylinderGeometry(0.014, 0.014, 1, 8);
  const barrelGeo = new CylinderGeometry(0.06, 0.06, 1, 10);

  const geometries = [boxGeo, pileGeo, pedestalGeo, mastGeo, brassConeGeo, greyConeGeo, rodGeo, mooringGeo, lampGeo, wheelGeo, drumGeo, gearGeo, gaugeGeo, tankGeo, pipeGeo, barrelGeo];
  const materials = [deckWood, plankWood, postTimber, iron, grey, brass, cargoWood, barrelWood, glow, glass];

  const slotDefs = [
    [boxGeo, deckWood], [boxGeo, plankWood], [pileGeo, postTimber], [boxGeo, iron], [boxGeo, grey],
    [boxGeo, brass], [boxGeo, cargoWood], [boxGeo, postTimber], [boxGeo, glass], [boxGeo, glow],
    [pedestalGeo, iron], [mastGeo, brass], [brassConeGeo, brass], [rodGeo, iron], [mooringGeo, iron],
    [lampGeo, iron], [wheelGeo, brass], [drumGeo, brass], [gearGeo, brass], [gaugeGeo, brass],
    [tankGeo, grey], [pipeGeo, brass], [barrelGeo, barrelWood], [greyConeGeo, grey]
  ] as const;

  const meshes: InstancedMesh[] = slotDefs.map(([geometry, material], index) => {
    const capacity = maxTiles * (PARTS_PER_TILE[index] ?? 1);
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = `dock-${index}`;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });

  const counts = new Array<number>(meshes.length).fill(0);

  const tempMatrix = new Matrix4();
  const localMatrix = new Matrix4();
  const rotationMatrix = new Matrix4();
  const scaleVec = new Vector3();
  const localEuler = new Euler(0, 0, 0, "YXZ");

  const clear = (): void => {
    for (let i = 0; i < counts.length; i += 1) counts[i] = 0;
  };

  const partTransforms: ReadonlyArray<{ readonly slot: number; readonly cx: number; readonly cy: number; readonly cz: number; readonly sx: number; readonly sy: number; readonly sz: number; readonly rx: number; readonly ry: number; readonly rz: number; readonly spin: boolean }> = (() => {
    const tieRod = between([0.14, 0.78, -0.04], [0.14, 1.06, 0.37]);
    const counterChain = between([0.14, 0.9, -0.19], [0.14, 0.78, -0.19]);
    const craneChain = between([0.14, 1.07, 0.37], [0.14, 0.46, 0.37]);
    const bowLine = between([0.24, 0.35, 0.42], [0.38, 0.24, 0.2]);
    const sternLine = between([0.24, 0.35, 0.42], [0.4, 0.24, 0]);
    const p = (slot: number, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, spin = false) => ({ slot, cx, cy, cz, sx, sy, sz, rx, ry, rz, spin });
    return [
      // Heavy timber pier: deck, plank strips, piles.
      p(SLOT.deck, 0, 0.07, 0.14, 0.56, 0.14, 0.6),
      p(SLOT.plank, 0, 0.145, -0.02, 0.5, 0.02, 0.18),
      p(SLOT.plank, 0, 0.145, 0.16, 0.5, 0.02, 0.18),
      p(SLOT.plank, 0, 0.145, 0.34, 0.5, 0.02, 0.18),
      p(SLOT.pile, -0.2, 0.13, 0.02, 1, 0.34, 1),
      p(SLOT.pile, 0.2, 0.13, 0.02, 1, 0.34, 1),
      p(SLOT.pile, -0.2, 0.13, 0.2, 1, 0.34, 1),
      p(SLOT.pile, 0.2, 0.13, 0.2, 1, 0.34, 1),
      p(SLOT.pile, -0.2, 0.13, 0.38, 1, 0.34, 1),
      p(SLOT.pile, 0.2, 0.13, 0.38, 1, 0.34, 1),
      // Compact dockhouse on the shore end.
      p(SLOT.greyBox, -0.14, 0.16, -0.01, 0.3, 0.04, 0.24),
      p(SLOT.ironBox, -0.14, 0.26, -0.01, 0.26, 0.16, 0.2),
      p(SLOT.doorBox, -0.1, 0.26, 0.105, 0.09, 0.1, 0.02),
      p(SLOT.glassBox, -0.19, 0.27, 0.105, 0.07, 0.05, 0.02),
      p(SLOT.glowBox, -0.19, 0.27, 0.1, 0.055, 0.035, 0.02),
      p(SLOT.ironBox, -0.14, 0.365, -0.01, 0.3, 0.05, 0.24),
      p(SLOT.brassBox, -0.14, 0.39, 0.11, 0.3, 0.012, 0.03),
      p(SLOT.greyBox, -0.22, 0.42, -0.07, 0.05, 0.16, 0.05),
      p(SLOT.cap, -0.22, 0.53, -0.07, 0.85, 0.06, 0.85),
      // Cargo crane: plinth, pedestal, tapered mast, cap, jib + counterweight.
      p(SLOT.greyBox, 0.14, 0.175, -0.04, 0.26, 0.07, 0.26),
      p(SLOT.pedestal, 0.14, 0.3, -0.04, 1, 0.18, 1),
      p(SLOT.mast, 0.14, 0.57, -0.04, 1, 0.36, 1),
      p(SLOT.mast, 0.14, 0.92, -0.04, 0.85, 0.34, 0.85),
      p(SLOT.brassCone, 0.14, 1.13, -0.04, 0.9, 0.1, 0.9),
      p(SLOT.brassBox, 0.14, 1.04, 0.15, 0.05, 0.05, 0.44, -Math.atan2(0.04, 0.44)),
      p(SLOT.brassBox, 0.14, 0.88, -0.12, 0.05, 0.05, 0.16, Math.atan2(0.03, 0.16)),
      p(SLOT.ironRod, tieRod.cx, tieRod.cy, tieRod.cz, 1, tieRod.sy, 1, tieRod.rx, tieRod.ry),
      p(SLOT.ironBox, 0.14, 0.725, -0.19, 0.11, 0.11, 0.11),
      p(SLOT.ironRod, counterChain.cx, counterChain.cy, counterChain.cz, 1, counterChain.sy, 1, counterChain.rx, counterChain.ry),
      // Pulley, hoist chain, hook and the suspended crate over the loading deck.
      p(SLOT.ironBox, 0.14, 1.08, 0.37, 0.07, 0.05, 0.05),
      p(SLOT.wheel, 0.14, 1.08, 0.385, 1, 0.02, 1, 0, 0, -PIO2),
      p(SLOT.ironRod, craneChain.cx, craneChain.cy, craneChain.cz, 1, craneChain.sy, 1, craneChain.rx, craneChain.ry),
      p(SLOT.brassCone, 0.14, 0.43, 0.37, 0.33, 0.06, 0.33, Math.PI),
      p(SLOT.cargoBox, 0.14, 0.38, 0.36, 0.16, 0.16, 0.16, 0, 0, 0, true),
      // Steam winch + boiler + pipes with a pressure valve.
      p(SLOT.greyBox, 0.06, 0.175, -0.16, 0.11, 0.07, 0.13),
      p(SLOT.drum, 0.06, 0.23, -0.16, 1, 0.12, 1, 0, 0, -PIO2),
      p(SLOT.gear, 0.12, 0.23, -0.16, 1, 0.025, 1, 0, 0, -PIO2),
      p(SLOT.brassBox, 0.12, 0.29, -0.16, 0.02, 0.05, 0.03),
      p(SLOT.tank, -0.05, 0.19, -0.2, 1, 0.12, 1, PIO2),
      p(SLOT.gauge, -0.05, 0.23, -0.14, 1, 0.02, 1, PIO2),
      p(SLOT.pipe, 0.29, 0.175, 0.09, 1, 0.3, 1, PIO2),
      p(SLOT.pipe, -0.05, 0.2, -0.155, 1, 0.12, 1, 0, 0, -PIO2),
      p(SLOT.brassBox, 0.29, 0.205, 0.09, 0.02, 0.06, 0.02),
      // Cargo waiting on the deck: stacked crates + barrels.
      p(SLOT.cargoBox, -0.13, 0.22, 0.3, 0.16, 0.16, 0.16),
      p(SLOT.cargoBox, -0.13, 0.38, 0.3, 0.1, 0.1, 0.1),
      p(SLOT.cargoBox, 0.02, 0.195, 0.38, 0.13, 0.13, 0.13),
      p(SLOT.barrel, -0.2, 0.23, 0.16, 1, 0.18, 1),
      p(SLOT.barrel, 0.02, 0.23, 0.2, 1, 0.18, 1),
      // Mooring posts + chains to the barge.
      p(SLOT.mooring, 0.24, 0.27, 0.42, 1, 0.28, 1),
      p(SLOT.mooring, -0.24, 0.27, 0.42, 1, 0.28, 1),
      p(SLOT.ironRod, bowLine.cx, bowLine.cy, bowLine.cz, 1, bowLine.sy, 1, bowLine.rx, bowLine.ry),
      p(SLOT.ironRod, sternLine.cx, sternLine.cy, sternLine.cz, 1, sternLine.sy, 1, sternLine.rx, sternLine.ry),
      // Small steampunk cargo barge moored alongside.
      p(SLOT.ironBox, 0.42, 0.045, 0.1, 0.13, 0.09, 0.3),
      p(SLOT.deck, 0.42, 0.095, 0.1, 0.115, 0.015, 0.28),
      p(SLOT.ironBox, 0.42, 0.145, 0, 0.09, 0.09, 0.16),
      p(SLOT.glowBox, 0.42, 0.145, 0.085, 0.06, 0.03, 0.015),
      p(SLOT.tank, 0.42, 0.25, 0.03, 0.5, 0.12, 0.5),
      p(SLOT.cargoBox, 0.42, 0.135, 0.18, 0.08, 0.08, 0.08),
      // Small amber lamps on the pier and the dockhouse.
      p(SLOT.lamp, 0.24, 0.44, 0.42, 1, 0.1, 1),
      p(SLOT.glowBox, 0.24, 0.5, 0.42, 0.035, 0.035, 0.035),
      p(SLOT.lamp, -0.24, 0.44, 0.42, 1, 0.1, 1),
      p(SLOT.glowBox, -0.24, 0.5, 0.42, 0.035, 0.035, 0.035),
      p(SLOT.lamp, -0.275, 0.31, -0.02, 1, 0.1, 1),
      p(SLOT.glowBox, -0.275, 0.37, -0.02, 0.03, 0.03, 0.03)
    ];
  })();

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    rotationY: number,
    worldX: number,
    worldZ: number
  ): void => {
    // Subtle per-tile variation: the hoisted crate is turned by a hash angle.
    const crateSpin = (tileHash(worldX, worldZ, 17, 5) - 2) * 0.3;

    rotationMatrix.makeRotationY(rotationY);

    for (const part of partTransforms) {
      const slot = part.slot;
      const slotCount = counts[slot] ?? 0;
      if (slotCount >= (maxTiles * (PARTS_PER_TILE[slot] ?? 1))) continue;
      scaleVec.set(part.sx, part.sy, part.sz);
      localEuler.set(part.rx, part.ry + (part.spin ? crateSpin : 0), part.rz, "YXZ");
      localMatrix.makeRotationFromEuler(localEuler);
      localMatrix.scale(scaleVec);
      // Position the local offset only (not the tile center) before rotating.
      // tempMatrix = rotationMatrix * localMatrix, whose translation works out
      // to rotationMatrix.linear * localMatrix.translation — so anything placed
      // in localMatrix's translation gets rotated. Baking centerX/centerZ into
      // that translation (as a previous version of this code did) rotates the
      // tile's own world position around the world origin, not just the part's
      // offset around the tile center: every dock away from world (0,0) with a
      // non-zero rotationY would render at the wrong place. Rotate the local
      // offset only, then translate by the (unrotated) tile center afterward.
      localMatrix.setPosition(part.cx, surfaceY + part.cy, part.cz);
      tempMatrix.copy(rotationMatrix);
      tempMatrix.multiply(localMatrix);
      tempMatrix.elements[12] += centerX;
      tempMatrix.elements[14] += centerZ;
      meshes[slot]!.setMatrixAt(slotCount, tempMatrix);
      counts[slot] = slotCount + 1;
    }
  };

  const commit = (): void => {
    // rebuildVisibleTerrain runs only when the visible tile set changed, so
    // commit is only ever called at a moment when matrices were re-written.
    // Re-upload every non-empty slot's used range: a dock swap keeps the same
    // per-slot counts, so a "count unchanged" skip would leave stale geometry
    // on the GPU. Partial range uploads (count * 16 floats) keep the cost low.
    for (let i = 0; i < meshes.length; i += 1) {
      const mesh = meshes[i]!;
      const count = counts[i] ?? 0;
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      if (count === 0) continue;
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};

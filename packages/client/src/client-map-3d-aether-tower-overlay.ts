// 3D Aether Tower overlay — the empire's aether transmission spires. Each
// instance is a tall brass-and-iron tower with a glowing cyan core, floating
// brass rings and upward-streaming motes. Towers placed near each other light
// up thin cyan aether conduits with brass rails, collar joints, breathing light
// nodes and travelling energy pulses; wherever at least three towers link
// together they form a synchronization cluster with a rotating geometric
// marker, escalating strength toward the linked nexus. build the body via
// writeTowerPieces and the network via writeLinkPieces/writeClusterPieces,
// then update(nowMs) each rendered frame.
//
// The bridge between the slot writers (which emits local/part placements) and
// the InstancedMesh buffers is node reuse: the overlay records the base index
// of each animated piece key per instance at commit time so update() only
// rewrites the live prefix of each buffer.

import {
  AdditiveBlending,
  BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from "three";
import {
  AETHER_TOWER_COLORS
} from "./client-map-3d-aether-tower-palette.js";
import {
  TOWER,
  TowerBodyContext,
  TowerPlacement,
  RewriteCtx,
  TowerAnimEntry,
  writeTowerPieces,
  rewriteTowerAnimated
} from "./client-map-3d-aether-tower-body.js";
import {
  AetherCluster,
  AetherLink,
  LinkAnimEntry,
  NetworkWriteContext,
  computeClusters,
  computeLinks,
  rewriteClusterAnimated,
  rewriteLinkAnimated,
  writeClusterPieces,
  writeLinkPieces
} from "./client-map-3d-aether-tower-network.js";

export type AetherTowerOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type AetherTowerInstance = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
};

type CapSpec = {
  readonly key: string;
  readonly mult: number;
};

const CAPS: readonly CapSpec[] = [
  { key: "plinth", mult: 1 },
  { key: "plinthTrim", mult: 1 },
  { key: "groundGlyph", mult: 1 },
  { key: "rivet", mult: 4 },
  { key: "shaftShoulder", mult: 1 },
  { key: "shaft", mult: 1 },
  { key: "band", mult: 2 },
  { key: "conduit", mult: 4 },
  { key: "strut", mult: 4 },
  { key: "cog", mult: 2 },
  { key: "cogTooth", mult: 8 },
  { key: "coreHalo", mult: 1 },
  { key: "core", mult: 1 },
  { key: "coreInner", mult: 1 },
  { key: "nexusHalo", mult: 1 },
  { key: "emitter", mult: 4 },
  { key: "emitterTip", mult: 4 },
  { key: "spinal", mult: 1 },
  { key: "ringCore", mult: 3 },
  { key: "ringNode", mult: 3 },
  { key: "nexusRing", mult: 3 },
  { key: "nexusGlow", mult: 1 },
  { key: "nexusRingNode", mult: 3 },
  { key: "spire", mult: 1 },
  { key: "spireBand", mult: 1 },
  { key: "spireTip", mult: 1 },
  { key: "mote", mult: 2 },
  { key: "linkBeam", mult: 3 },
  { key: "linkCable", mult: 6 },
  { key: "linkSocket", mult: 4 },
  { key: "linkJoint", mult: 6 },
  { key: "linkDroop", mult: 3 },
  { key: "linkNode", mult: 6 },
  { key: "linkTraveler", mult: 6 },
  { key: "clusterGlyph", mult: 2 },
  { key: "clusterOrb", mult: 2 },
  { key: "clusterRing", mult: 2 }
];

type Slot = { mesh: InstancedMesh; count: number; cap: number };

export const createAetherTowerOverlay = (scene: Scene, maxTiles: number): AetherTowerOverlay => {
  // The graph handshake bounds links (< per-tower degree 3), so per-key
  // instances stay under cap even for dense placements; a tower over 64 is
  // theatrically implausible and the palette keeps matrices small.
  const CAPACITY = Math.min(64, Math.max(1, Math.floor(maxTiles)));

  // ─── Materials ──────────────────────────────────────────────────────
  const materials: Material[] = [];
  const metal = (color: string, roughness: number, metalness: number): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    materials.push(m);
    return m;
  };
  const emissiveMetal = (color: string, emissive: string, intensity: number): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3, flatShading: true, emissive, emissiveIntensity: intensity });
    materials.push(m);
    return m;
  };
  const glow = (color: string, opacity: number): MeshBasicMaterial => {
    const m = new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
    materials.push(m);
    return m;
  };

  const iron = metal(AETHER_TOWER_COLORS.iron, 0.55, 0.6);
  const brass = metal(AETHER_TOWER_COLORS.brass, 0.45, 0.85);
  const brassBright = metal(AETHER_TOWER_COLORS.brassBright, 0.35, 0.92);
  const brassDark = metal(AETHER_TOWER_COLORS.brassDark, 0.5, 0.8);
  const copper = metal(AETHER_TOWER_COLORS.copper, 0.45, 0.8);
  const coreMat = emissiveMetal(AETHER_TOWER_COLORS.ironDark, AETHER_TOWER_COLORS.aetherCore, 1.0);
  const beamMat = emissiveMetal("#0b2430", AETHER_TOWER_COLORS.aetherMid, 0.9);
  const glyphMat = emissiveMetal(AETHER_TOWER_COLORS.ironDark, AETHER_TOWER_COLORS.aetherDeep, 0.7);
  const glowBright = glow(AETHER_TOWER_COLORS.aetherBright, 0.95);
  const glowCore = glow(AETHER_TOWER_COLORS.aetherCore, 0.6);
  const glowSoft = glow(AETHER_TOWER_COLORS.aetherCore, 0.4);
  const glowFaint = glow(AETHER_TOWER_COLORS.aetherMid, 0.3);

  // ─── Geometries ─────────────────────────────────────────────────────
  const geometries: BufferGeometry[] = [];
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const cylinder = (rt: number, rb: number, h: number, seg: number): CylinderGeometry => geo(new CylinderGeometry(rt, rb, h, seg));
  const torus = (r: number, t: number, seg: number, sub: number): TorusGeometry => geo(new TorusGeometry(r, t, seg, sub));
  const sphere = (r: number, w: number, h: number): SphereGeometry => geo(new SphereGeometry(r, w, h));

  const plinthGeo = cylinder(0.34, 0.38, 0.07, 6);
  const plinthTrimGeo = torus(0.375, 0.009, 5, 14);
  const glyphGeo = geo(new CircleGeometry(0.6, 3));
  const rivetGeo = sphere(0.016, 6, 4);
  const shoulderGeo = cylinder(0.14, 0.15, 0.05, 8);
  const shaftGeo = cylinder(0.07, 0.1, 1, 8);
  const bandGeo = torus(0.1, 0.008, 5, 14);
  const conduitGeo = cylinder(0.045, 0.045, 1, 6);
  const strutGeo = cylinder(0.012, 0.012, 1, 6);
  const cogGeo = cylinder(0.08, 0.08, 0.02, 16);
  const cogToothGeo = geo(new BoxGeometry(0.014, 0.05, 0.01));
  const coreHaloGeo = sphere(0.19, 12, 8);
  const coreGeo = sphere(0.17, 12, 8);
  const coreInnerGeo = sphere(0.105, 10, 7);
  const nexusHaloGeo = sphere(0.225, 12, 8);
  const emitterGeo = cylinder(0.035, 0.045, 1, 4);
  const emitterTipGeo = sphere(0.032, 6, 5);
  const spinalGeo = cylinder(0.02, 0.02, 1, 6);
  const ringCoreGeo = torus(0.31, 0.012, 6, 24);
  const ringNodeGeo = sphere(0.024, 6, 5);
  const nexusRingGeo = torus(0.46, 0.014, 6, 24);
  const nexusRingNodeGeo = sphere(0.021, 6, 5);
  const nexusGlowGeo = geo(new RingGeometry(0.4, 0.5, 32));
  const spireGeo = cylinder(0.02, 0.05, 1, 8);
  const spireBandGeo = torus(0.035, 0.006, 5, 12);
  const spireTipGeo = sphere(0.026, 6, 5);
  const moteGeo = sphere(0.014, 5, 4);
  const beamGeo = cylinder(0.034, 0.034, 1, 6);
  const cableGeo = cylinder(0.008, 0.008, 1, 5);
  const droopGeo = sphere(0.014, 5, 4);
  const jointGeo = torus(0.05, 0.013, 5, 10);
  const socketGeo = torus(0.05, 0.016, 5, 10);
  const icosa = (r: number, detail: number): IcosahedronGeometry => geo(new IcosahedronGeometry(r, detail));
  const nodeGeo = icosa(0.026, 0);
  const travelerGeo = icosa(0.03, 0);
  const orbGeo = icosa(0.09, 1);
  const clusterRingGeo = torus(0.44, 0.02, 6, 20);

  const geoOf: Record<string, BufferGeometry> = {
    plinth: plinthGeo, plinthTrim: plinthTrimGeo, groundGlyph: glyphGeo, rivet: rivetGeo,
    shaftShoulder: shoulderGeo, shaft: shaftGeo, band: bandGeo, conduit: conduitGeo,
    strut: strutGeo, cog: cogGeo, cogTooth: cogToothGeo, coreHalo: coreHaloGeo,
    core: coreGeo, coreInner: coreInnerGeo, nexusHalo: nexusHaloGeo, emitter: emitterGeo,
    emitterTip: emitterTipGeo, spinal: spinalGeo, ringCore: ringCoreGeo, ringNode: ringNodeGeo,
    nexusRing: nexusRingGeo, nexusGlow: nexusGlowGeo, nexusRingNode: nexusRingNodeGeo,
    spire: spireGeo, spireBand: spireBandGeo, spireTip: spireTipGeo, mote: moteGeo,
    linkBeam: beamGeo, linkCable: cableGeo, linkSocket: socketGeo, linkJoint: jointGeo,
    linkDroop: droopGeo, linkNode: nodeGeo, linkTraveler: travelerGeo,
    clusterGlyph: glyphGeo, clusterOrb: orbGeo, clusterRing: clusterRingGeo
  };

  const matOf: Record<string, Material> = {
    plinth: iron, plinthTrim: brassDark, groundGlyph: glyphMat, rivet: brass,
    shaftShoulder: iron, shaft: brass, band: copper, conduit: brassDark,
    strut: iron, cog: brass, cogTooth: brassDark, coreHalo: glowSoft,
    core: coreMat, coreInner: glowCore, nexusHalo: glowFaint, emitter: brassBright,
    emitterTip: glowCore, spinal: glowFaint, ringCore: brassBright, ringNode: glowBright,
    nexusRing: brassBright, nexusGlow: glowSoft, nexusRingNode: glowBright,
    spire: brassDark, spireBand: copper, spireTip: glowBright, mote: glowBright,
    linkBeam: beamMat, linkCable: brassDark, linkSocket: brass, linkJoint: brassDark,
    linkDroop: brass, linkNode: glowBright, linkTraveler: glowCore,
    clusterGlyph: glyphMat, clusterOrb: glowCore, clusterRing: brassBright
  };

  // ─── InstancedMesh registry ─────────────────────────────────────────
  type RawSlot = { mesh: InstancedMesh; count: number };
  const slots = new Map<string, RawSlot>();
  for (const spec of CAPS) {
    const { key, mult } = spec;
    const mesh = new InstancedMesh(geoOf[key]!, matOf[key]!, CAPACITY * mult);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    slots.set(key, { mesh, count: 0 });
  }

  // ─── Piece writing bridge ───────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();
  const tmpDir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);

  const slotCount = (key: string): number => {
    const s = slots.get(key);
    return s ? s.count : 0;
  };

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
    if (!slot) return;
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

  const addPieceAlong = (key: string, wx: number, sy: number, wz: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number): void => {
    tmpDir.set(dx, dy, dz).normalize();
    tmpQuat.setFromUnitVectors(yAxis, tmpDir);
    tmpEuler.setFromQuaternion(tmpQuat);
    addPiece(key, wx, sy, wz, ox, oy, oz, 1, 1, len, tmpEuler.y, tmpEuler.x, tmpEuler.z);
  };

  // ─── Instance / link / cluster registry ─────────────────────────────
  const instances: AetherTowerInstance[] = [];
  type TowerAnim = TowerAnimEntry;
  const towerAnims: TowerAnim[] = [];
  type LinkAnim = { readonly link: AetherLink; readonly anim: LinkAnimEntry };
  const linkAnims: LinkAnim[] = [];
  type ClusterAnim = { readonly cluster: AetherCluster; readonly orbBase: number; readonly ringBase: number };
  const clusterAnims: ClusterAnim[] = [];

  const resetSlots = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    resetSlots();
    instances.length = 0;
    towerAnims.length = 0;
    linkAnims.length = 0;
    clusterAnims.length = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number): void => {
    if (instances.length >= CAPACITY) return;
    const hash = ((worldTileX * 92_821) ^ (worldTileY * 68_917)) >>> 0;
    const phase = ((hash % 1000) / 1000) * Math.PI * 2;
    instances.push({ x: sceneX, y: surfaceY, z: sceneZ, phase });
  };

  const commit = (): void => {
    resetSlots();
    towerAnims.length = 0;
    linkAnims.length = 0;
    clusterAnims.length = 0;

    // 1. Derive the network graph so towers know their bridge status.
    const pts: Array<{ x: number; z: number }> = instances.map((t) => ({ x: t.x, z: t.z }));
    const links = computeLinks(pts);
    const clusters = computeClusters(pts, links);
    const linkDegree = new Array<number>(instances.length).fill(0);
    for (const l of links) {
      linkDegree[l.a]! += 1;
      linkDegree[l.b]! += 1;
    }

    // 2. Write tower bodies (bases point into the per-key buffer).
    for (let i = 0; i < instances.length; i += 1) {
      const t = instances[i]!;
      const bases: Record<string, number> = {};
      const level = Math.min(3, linkDegree[i]!);
      const nexus = TOWER.nexusScaleByLevel[level]!;
      const writer: TowerBodyContext = {
        addPiece: (key, ox, oy, oz, sx = 1, sz = 1, sy = 1, rotY = 0, rotX = 0, rotZ = 0) => {
          if (!(key in bases)) bases[key] = slotCount(key);
          addPiece(key, t.x, t.y, t.z, ox, oy, oz, sx, sz, sy, rotY, rotX, rotZ);
        },
        addPieceAlong: (key, ox, oy, oz, dx, dy, dz, len) => {
          if (!(key in bases)) bases[key] = slotCount(key);
          addPieceAlong(key, t.x, t.y, t.z, ox, oy, oz, dx, dy, dz, len);
        }
      };
      const placement: TowerPlacement = { x: t.x, z: t.z, phase: t.phase, level, nexus };
      writeTowerPieces(writer, placement);
      towerAnims.push({ ...placement, bases });
    }

    // 3. Write link strands + their animated bands. Link pieces are already in
    // world coordinates, so the writer maps local offsets straight through.
    const netWriter: NetworkWriteContext = {
      addPiece: (key, ox, oy, oz, sx = 1, sz = 1, sy = 1, rotY = 0, rotX = 0, rotZ = 0) =>
        addPiece(key, 0, 0, 0, ox, oy, oz, sx, sz, sy, rotY, rotX, rotZ),
      addPieceAlong: (key, ox, oy, oz, dx, dy, dz, len) =>
        addPieceAlong(key, 0, 0, 0, ox, oy, oz, dx, dy, dz, len)
    };
    for (const link of links) {
      const nodeBase = slotCount("linkNode");
      const travelerBase = slotCount("linkTraveler");
      writeLinkPieces(netWriter, link);
      linkAnims.push({ link, anim: { nodeBase, travelerBase } });
    }

    // 4. Write clusters.
    for (const cluster of clusters) {
      const orbBase = slotCount("clusterOrb");
      const ringBase = slotCount("clusterRing");
      writeClusterPieces(netWriter, cluster);
      clusterAnims.push({ cluster, orbBase, ringBase });
    }

    // 5. Publish buffers.
    for (const slot of slots.values()) {
      const { mesh, count } = slot;
      mesh.count = count;
      if (count === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  // ─── Per-frame animated rewriting ───────────────────────────────────
  const dirty = new Set<string>();
  const flushDirty = (): void => {
    for (const key of dirty) {
      const slot = slots.get(key);
      if (!slot || slot.count === 0) continue;
      const { mesh, count } = slot;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
    dirty.clear();
  };

  const rewriteCtx: RewriteCtx = {
    set: (key, index, m) => {
      const slot = slots.get(key);
      if (slot) slot.mesh.setMatrixAt(index, m);
    },
    markDirty: (key) => {
      const slot = slots.get(key);
      if (slot && slot.count > 0) dirty.add(key);
    }
  };

  const update = (nowMs: number): void => {
    if (towerAnims.length === 0) return;
    for (const t of towerAnims) rewriteTowerAnimated(rewriteCtx, t, nowMs);
    for (const l of linkAnims) rewriteLinkAnimated(rewriteCtx, l.link, l.anim, nowMs);
    for (const c of clusterAnims) rewriteClusterAnimated(rewriteCtx, c.cluster, c.orbBase, c.ringBase, nowMs);
    flushDirty();
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  return { clear, addInstance, commit, update, dispose };
};
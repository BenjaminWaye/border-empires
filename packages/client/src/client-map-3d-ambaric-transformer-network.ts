// 3D Aether Tower — network module. Compose the geometric side of the empire's
// aether grid: thin cyan conduits with brass rails, collar joints and light
// nodes strung between peered towers, plus the synchronization cluster that
// forms wherever several towers stand close together. This module only reasons
// about *geometry placement*; the overlay supplies the slot writers and the
// animated rewrites, so this module owns no geometry or material instances.
//
// A network is derived from placed towers at commit() time and never cached
// between commits: computeLinks bounds each tower to its near neighbours (the
// web strands), computeClusters finds connected groups large enough to anchor
// a cluster marker. Pieces are emitted through the caller's writer.

import { Euler, Matrix4, Quaternion, Vector3 } from "three";

export type LinkTower = {
  readonly x: number;
  readonly z: number;
};

export type AetherLink = {
  readonly a: number;
  readonly b: number;
  readonly midX: number;
  readonly midZ: number;
  // Unit direction from tower a to tower b.
  readonly dx: number;
  readonly dz: number;
  // Beam length (tower-to-tower distance minus clearance).
  readonly len: number;
  readonly phase: number;
};

export type AetherCluster = {
  readonly x: number;
  readonly z: number;
  readonly memberCount: number;
  readonly radius: number;
  readonly phase: number;
};

export type LinkAnimEntry = {
  readonly nodeBase: number;
  readonly travelerBase: number;
};

export const LINK = {
  maxLength: 2.7,
  maxDegree: 3,
  clearance: 0.68,
  // Beam: a cylindrical aether conduit at core height.
  beamRadius: 0.034,
  beamY: 0.72,
  // Twin brass rails riding below the beam with a droop bead at midspan.
  cableCount: 2,
  cableRadius: 0.008,
  cableDrop: 0.05,
  // Brass collar joints spaced along the beam, each carrying a light node.
  jointFractions: [0.22, 0.5, 0.78] as const,
  jointRadius: 0.05,
  jointBandRadius: 0.013,
  nodeLen: 0.1,
  // Travelling energy pulses.
  travelerCount: 3,
  travelerSpeed: [0.00062, 0.00082, 0.0007] as const
} as const;

export const CLUSTER = {
  minMembers: 3,
  glyphY: 0.02,
  glyphRadius: 0.6,
  orbY: 0.52,
  orbRadius: 0.09,
  ringY: 0.84,
  ringRadius: 0.44,
  ringTiltX: 0.7,
  ringSpinSpeed: 0.0007
} as const;

const hashPhase = (a: number, b: number): number => {
  let h = (a * 92_821) ^ (b * 68_917);
  h = (h ^ (h >>> 16)) * 0x45d9f3b;
  h = (h ^ (h >>> 16)) >>> 0;
  return ((h % 1000) / 1000) * Math.PI * 2;
};

export const computeLinks = (towers: readonly LinkTower[], maxLength = LINK.maxLength): AetherLink[] => {
  const links: AetherLink[] = [];
  const degree = new Array<number>(towers.length).fill(0);
  for (let a = 0; a < towers.length; a += 1) {
    const at = towers[a]!;
    const candidates: Array<{ b: number; dist: number }> = [];
    for (let b = 0; b < towers.length; b += 1) {
      if (b === a) continue;
      const bt = towers[b]!;
      const dist = Math.hypot(bt.x - at.x, bt.z - at.z);
      if (dist > maxLength || dist < 0.01) continue;
      candidates.push({ b, dist });
    }
    candidates.sort((p, q) => p.dist - q.dist);
    for (const { b, dist } of candidates) {
      if (degree[a]! >= LINK.maxDegree) break;
      if (degree[b]! >= LINK.maxDegree) continue;
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      if (links.some((l) => l.a === lo && l.b === hi)) continue;
      const bt = towers[b]!;
      const dx = (bt.x - at.x) / dist;
      const dz = (bt.z - at.z) / dist;
      degree[a]! += 1;
      degree[b]! += 1;
      links.push({
        a: lo,
        b: hi,
        midX: (at.x + bt.x) / 2,
        midZ: (at.z + bt.z) / 2,
        dx,
        dz,
        len: Math.max(dist - LINK.clearance, 0.05),
        phase: hashPhase(lo + 1, hi + 1)
      });
    }
  }
  return links;
};

// Connected components over the link graph; components with at least
// CLUSTER.minMembers towers get a synchronization cluster at their centroid.
export const computeClusters = (towers: readonly LinkTower[], links: readonly AetherLink[]): AetherCluster[] => {
  const n = towers.length;
  const parent = new Array<number>(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur]!;
      parent[cur] = r;
      cur = next;
    }
    return r;
  };
  for (const l of links) {
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra !== rb) parent[rb] = ra;
  }

  const members = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) members[find(i)]! += 1;

  const clusters: AetherCluster[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const size = members[root]!;
    if (size < CLUSTER.minMembers || used.has(root)) continue;
    used.add(root);
    let sx = 0;
    let sz = 0;
    for (let j = 0; j < n; j += 1) {
      if (find(j) === root) {
        sx += towers[j]!.x;
        sz += towers[j]!.z;
      }
    }
    clusters.push({
      x: sx / size,
      z: sz / size,
      memberCount: size,
      radius: CLUSTER.glyphRadius + size * 0.05,
      phase: hashPhase((root + 1) * 7, size * 13 + 3)
    });
  }
  return clusters;
};

export type NetworkWritePiece = (
  key: string,
  ox: number,
  oy: number,
  oz: number,
  sx?: number,
  sz?: number,
  sy?: number,
  rotY?: number,
  rotX?: number,
  rotZ?: number
) => void;

export type NetworkWriteContext = {
  readonly addPiece: NetworkWritePiece;
  readonly addPieceAlong: (key: string, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number) => void;
};

export const writeLinkPieces = (ctx: NetworkWriteContext, l: AetherLink): void => {
  const { addPiece, addPieceAlong } = ctx;
  const { dx, dz, len, midX, midZ, phase } = l;
  const ex = midX - dx * (len / 2);
  const ez = midZ - dz * (len / 2);

  // Aether conduit beam spanning the gap at core height.
  addPieceAlong("linkBeam", midX, LINK.beamY, midZ, dx, 0, dz, len);

  // Brass socket collars at both beam ends.
  addPieceAlong("linkSocket", ex, LINK.beamY, ez, dx, 0, dz, LINK.jointBandRadius * 2);
  addPieceAlong("linkSocket", ex + dx * len, LINK.beamY, ez + dz * len, dx, 0, dz, LINK.jointBandRadius * 2);

  // Twin brass rails hanging below the beam, plus a droop bead at midspan.
  const px = -dz;
  const pz = dx;
  const railOff = LINK.beamRadius + LINK.cableRadius + 0.005;
  for (const sign of [-1, 1] as const) {
    addPieceAlong("linkCable", midX + px * (sign * railOff), LINK.beamY - LINK.cableDrop, midZ + pz * (sign * railOff), dx, 0, dz, len);
  }
  addPiece("linkDroop", midX, LINK.beamY - LINK.cableDrop - 0.024, midZ, 1, 1, 1, 0, phase * 0.3, 0);

  // Brass collar joints spaced along the beam, then a light node on each.
  for (const f of LINK.jointFractions) {
    const jx = midX + dx * ((f - 0.5) * len);
    const jz = midZ + dz * ((f - 0.5) * len);
    addPieceAlong("linkJoint", jx, LINK.beamY, jz, dx, 0, dz, LINK.jointRadius * 2);
  }
  for (const f of LINK.jointFractions) {
    const jx = midX + dx * ((f - 0.5) * len);
    const jz = midZ + dz * ((f - 0.5) * len);
    addPieceAlong("linkNode", jx, LINK.beamY, jz, dx, 0, dz, LINK.nodeLen);
  }
  // Travelling pulses seeded at commit so pre-update renders are coherent.
  for (let k = 0; k < LINK.travelerCount; k += 1) {
    const s = k / LINK.travelerCount - 0.25;
    addPieceAlong("linkTraveler", midX + dx * (s * len), LINK.beamY, midZ + dz * (s * len), dx, 0, dz, 1);
  }
};

export const writeClusterPieces = (ctx: NetworkWriteContext, c: AetherCluster): void => {
  const { addPiece } = ctx;
  const glyphScale = c.radius / CLUSTER.glyphRadius;
  const ringScale = c.radius / CLUSTER.ringRadius;
  addPiece("clusterGlyph", c.x, CLUSTER.glyphY, c.z, glyphScale, glyphScale, 1, 0, Math.PI / 2, c.phase * 0.7);
  addPiece("clusterOrb", c.x, CLUSTER.orbY, c.z, glyphScale, glyphScale, glyphScale);
  addPiece("clusterRing", c.x, CLUSTER.ringY, c.z, ringScale, ringScale, 1, 0, Math.PI / 2, 0);
};

// ─── Animated rewriting (own scratch allocators to stay decoupled) ─────────
const scrMatrix = new Matrix4();
const scrPos = new Vector3();
const scrScale = new Vector3();
const scrQuat = new Quaternion();
const scrEuler = new Euler();
const yAxis = new Vector3(0, 1, 0);

// Euler decomposing the rotation that maps +Y (a piece's length axis) onto the
// given direction — the same convention the overlay's addPieceAlong uses.
const orientAlongDir = (dx: number, dy: number, dz: number): void => {
  scrPos.set(dx, dy, dz).normalize();
  scrQuat.setFromUnitVectors(yAxis, scrPos);
  scrEuler.setFromQuaternion(scrQuat);
};

const compose = (x: number, y: number, z: number, rotX: number, rotY: number, rotZ: number, sx: number, sy: number, sz: number): Matrix4 => {
  scrEuler.set(rotX, rotY, rotZ, "XYZ");
  scrQuat.setFromEuler(scrEuler);
  scrPos.set(x, y, z);
  scrScale.set(sx, sy, sz);
  return scrMatrix.compose(scrPos, scrQuat, scrScale);
};

export type NetworkRewriteContext = {
  readonly set: (key: string, index: number, matrix: Matrix4) => void;
  readonly markDirty: (key: string) => void;
};

export const rewriteLinkAnimated = (ctx: NetworkRewriteContext, l: AetherLink, anim: LinkAnimEntry, nowMs: number): void => {
  const { dx, dz, len, midX, midZ, phase } = l;
  orientAlongDir(dx, 0, dz);

  // Pulses travel monotonically along the beam, one per third of the span.
  for (let k = 0; k < LINK.travelerCount; k += 1) {
    const t = ((nowMs * LINK.travelerSpeed[k]!) + phase / (Math.PI * 2) + k / LINK.travelerCount) % 1;
    const pulse = 0.7 + 0.5 * Math.sin(nowMs * 0.006 + phase + k);
    ctx.set(
      "linkTraveler",
      anim.travelerBase + k,
      compose(
        midX + dx * ((t - 0.5) * len),
        LINK.beamY,
        midZ + dz * ((t - 0.5) * len),
        scrEuler.x,
        scrEuler.y,
        scrEuler.z,
        pulse,
        pulse,
        pulse
      )
    );
  }

  // Light nodes breathe in place along the beam.
  for (let k = 0; k < LINK.jointFractions.length; k += 1) {
    const f = LINK.jointFractions[k]!;
    const jx = midX + dx * ((f - 0.5) * len);
    const jz = midZ + dz * ((f - 0.5) * len);
    const pulse = 0.72 + 0.28 * Math.sin(nowMs * 0.0035 + phase * 2 + k * 1.7);
    ctx.set(
      "linkNode",
      anim.nodeBase + k,
      compose(jx, LINK.beamY, jz, scrEuler.x, scrEuler.y, scrEuler.z, pulse, LINK.nodeLen, pulse)
    );
  }

  ctx.markDirty("linkTraveler");
  ctx.markDirty("linkNode");
};

export const rewriteClusterAnimated = (ctx: NetworkRewriteContext, c: AetherCluster, orbBase: number, ringBase: number, nowMs: number): void => {
  const orbPulse = 0.85 + 0.3 * Math.sin(nowMs * 0.0018 + c.phase);
  const orbY = CLUSTER.orbY + Math.sin(nowMs * 0.0012 + c.phase) * 0.035;
  ctx.set("clusterOrb", orbBase, compose(c.x, orbY, c.z, 0, 0, 0, orbPulse, orbPulse, orbPulse));

  const s = c.radius / CLUSTER.ringRadius;
  const spin = nowMs * CLUSTER.ringSpinSpeed + c.phase;
  const bob = Math.sin(nowMs * 0.001 + c.phase * 2) * 0.02;
  ctx.set("clusterRing", ringBase, compose(c.x, CLUSTER.ringY + bob, c.z, CLUSTER.ringTiltX, spin, 0, s, s, 1));

  ctx.markDirty("clusterOrb");
  ctx.markDirty("clusterRing");
};
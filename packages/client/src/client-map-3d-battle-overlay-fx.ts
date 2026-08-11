import {
  SphereGeometry,
  OctahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  Color,
  Scene,
} from "three";

// Renders every concurrently active combat as a converging/colliding/routing
// pair of dot swarms plus a small glyph-burst flourish, driven entirely by
// server-resolved outcomes (see CombatBroadcastPayload in @border-empires/
// sim-protocol and client-battle-overlay.ts for how state.activeBattles gets
// populated). The animation never decides anything — attackerWon is already
// known before the first frame renders; this module only stages the reveal.
//
// Timeline per battle (all relative to its own startAt):
//   [0, APPROACH_MS)                      — approach: both sides converge on the tile midpoint
//   [APPROACH_MS, APPROACH_MS+CLASH_MS)   — clash: oscillating melee at the midpoint + glyph bursts
//   [APPROACH_MS+CLASH_MS, endAt)         — rout: winner pushes through, loser scatters/collapses
export const APPROACH_MS = 550;
export const CLASH_MS = 800;
export const ROUT_MS = 950;
export const BATTLE_OVERLAY_TOTAL_MS = APPROACH_MS + CLASH_MS + ROUT_MS;

const MAX_CONCURRENT_BATTLES = 16;
const DOTS_PER_SIDE = 10;
const SHARDS_PER_BATTLE = 6;
const FORMATION_T = 0.7;
// Round dots (not the muster overlay's tall "soldier spike" cone) so the
// swarm reads as a mass of circular dots from the game's 3/4 strategic
// camera angle at any zoom, per the "strong silhouette, readable at normal
// strategic zoom" design goal — verified against a Storybook demo, where
// the original cone geometry at soldier-icon scale (radius 0.011) rendered
// as near-invisible slivers.
const DOT_RADIUS = 0.045;
const DOT_Y_OFFSET = 0.07;
const PUSH_THROUGH_FRACTION = 0.4;
const RETREAT_FRACTION = 0.38;
const SHARD_Y_OFFSET = 0.14;
const SHARD_SIZE = 0.055;
const UP_AXIS = new Vector3(0, 1, 0);

function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393) ^ (b * 668265263) ^ (salt * 15485863);
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return (h >>> 0) / 0xffffffff;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export type BattleOverlayRenderEntry = {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  attackerWon: boolean;
  startAt: number;
  clashAt: number;
  endAt: number;
};

// A siege still counting down to its resolution tick — the server hasn't
// broadcast a CombatBroadcastPayload yet (that only fires once, at
// resolveLock), so the outcome is unknown. Renders as an indefinite clash
// loop at the tile midpoint with no approach/rout phases and no glyph
// bursts, so it reads as "still contested" rather than "just resolved".
export type BattleOverlaySkirmishEntry = {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  // Stable per-tile hash seed (derived from target tile coordinates), NOT
  // an array index — unlike resolved battles, a skirmish can sit in the
  // list for many seconds, and any concurrent battle starting/ending
  // elsewhere on the map would otherwise reshuffle its position-in-array
  // and reroll every dot's offset/frequency/phase mid-loop, reading as a
  // visible pop in the swarm.
  hashSeed: number;
};

type DotKit = { offset: number; perpPos: number; freq: number; phase: number };
type ShardKit = { spawnT: number; angle: number; dist: number; life: number; variant: 0 | 1 };

export type BattleOverlayFx = ReturnType<typeof createBattleOverlayFx>;

export function createBattleOverlayFx(scene: Scene) {
  const dotGeom = new SphereGeometry(DOT_RADIUS, 8, 6);
  const shardGeom = new OctahedronGeometry(SHARD_SIZE, 0);

  // Deliberately NOT setting vertexColors:true here: InstancedMesh.setColorAt()
  // tints each instance automatically once instanceColor exists (three.js
  // enables USE_INSTANCING_COLOR on its own) — vertexColors is a *separate*
  // per-vertex-geometry-attribute mechanism, and turning it on for a geometry
  // with no `color` attribute (plain SphereGeometry here) makes the vertex
  // shader multiply in an unbound attribute that reads as black, zeroing out
  // every instance's color regardless of what setColorAt wrote.
  const attackerMat = new MeshBasicMaterial({ color: "#ffffff", depthTest: false, depthWrite: false });
  const defenderMat = new MeshBasicMaterial({ color: "#ffffff", depthTest: false, depthWrite: false });
  const shardMatA = new MeshBasicMaterial({ color: "#ffcf6b", depthTest: false, depthWrite: false, transparent: true });
  const shardMatB = new MeshBasicMaterial({ color: "#b388ff", depthTest: false, depthWrite: false, transparent: true });

  const attackerMesh = new InstancedMesh(dotGeom, attackerMat, MAX_CONCURRENT_BATTLES * DOTS_PER_SIDE);
  const defenderMesh = new InstancedMesh(dotGeom, defenderMat, MAX_CONCURRENT_BATTLES * DOTS_PER_SIDE);
  const shardMeshA = new InstancedMesh(shardGeom, shardMatA, Math.ceil((MAX_CONCURRENT_BATTLES * SHARDS_PER_BATTLE) / 2));
  const shardMeshB = new InstancedMesh(shardGeom, shardMatB, Math.floor((MAX_CONCURRENT_BATTLES * SHARDS_PER_BATTLE) / 2));

  for (const mesh of [attackerMesh, defenderMesh, shardMeshA, shardMeshB]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 37;
    scene.add(mesh);
  }

  const tmpColor = new Color();
  const tmpM = new Matrix4();
  const tmpPos = new Vector3();
  const tmpScale = new Vector3();
  const tmpQuat = new Quaternion();
  const identityQuat = new Quaternion();

  const dotKitFor = (slot: number, side: 0 | 1, i: number): DotKit => ({
    offset: hash01(slot * 31 + i, side, 3) * 0.22,
    perpPos: (hash01(slot * 31 + i, side, 0) - 0.5) * 0.8,
    freq: 4 + hash01(slot * 31 + i, side, 1) * 8,
    phase: hash01(slot * 31 + i, side, 2) * Math.PI * 2,
  });

  const shardKitFor = (slot: number, j: number): ShardKit => ({
    spawnT: hash01(slot * 53 + j, 7, 11),
    angle: hash01(slot * 53 + j, 7, 13) * Math.PI * 2,
    dist: 0.08 + hash01(slot * 53 + j, 7, 17) * 0.18,
    life: 0.28 + hash01(slot * 53 + j, 7, 19) * 0.2,
    variant: (j % 2) as 0 | 1,
  });

  const clear = (): void => {
    attackerMesh.count = 0;
    defenderMesh.count = 0;
    shardMeshA.count = 0;
    shardMeshB.count = 0;
  };

  const tick = (
    nowMs: number,
    battles: BattleOverlayRenderEntry[],
    skirmishes: BattleOverlaySkirmishEntry[] = []
  ): void => {
    if (battles.length === 0 && skirmishes.length === 0) { clear(); return; }

    let atkWrite = 0;
    let defWrite = 0;
    let shardAWrite = 0;
    let shardBWrite = 0;
    let slot = 0;

    for (; slot < battles.length && slot < MAX_CONCURRENT_BATTLES; slot++) {
      const b = battles[slot]!;
      const dirX = b.tgtWorldX - b.srcWorldX;
      const dirZ = b.tgtWorldZ - b.srcWorldZ;
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dist < 0.001) continue;
      const ux = dirX / dist;
      const uz = dirZ / dist;
      const perpX = -uz;
      const perpZ = ux;
      const midX = (b.srcWorldX + b.tgtWorldX) * 0.5;
      const midZ = (b.srcWorldZ + b.tgtWorldZ) * 0.5;
      const midY = (b.srcSurfaceY + b.tgtSurfaceY) * 0.5 + DOT_Y_OFFSET;

      const clashEndAt = b.clashAt + CLASH_MS;
      const routElapsed = nowMs - clashEndAt;

      for (let side = 0 as 0 | 1; side < 2; side++) {
        const isAttacker = side === 0;
        const winning = isAttacker ? b.attackerWon : !b.attackerWon;
        const startX = isAttacker ? b.srcWorldX : b.tgtWorldX;
        const startZ = isAttacker ? b.srcWorldZ : b.tgtWorldZ;
        // Each side's own forward direction (attacker travels src->mid, defender travels tgt->mid).
        const fwdX = isAttacker ? ux : -ux;
        const fwdZ = isAttacker ? uz : -uz;
        const mesh = isAttacker ? attackerMesh : defenderMesh;
        tmpColor.set(isAttacker ? b.attackerColor : b.defenderColor);

        for (let i = 0; i < DOTS_PER_SIDE; i++) {
          const kit = dotKitFor(slot, side, i);
          let x: number;
          let z: number;
          let scale = 1;

          if (nowMs < b.clashAt) {
            const approachT = clamp01((nowMs - b.startAt) / APPROACH_MS);
            const localT = clamp01((approachT - kit.offset) / (FORMATION_T - kit.offset));
            x = startX + (midX - startX) * localT + perpX * kit.perpPos;
            z = startZ + (midZ - startZ) * localT + perpZ * kit.perpPos;
          } else if (nowMs < clashEndAt) {
            const osc = Math.sin(nowMs / kit.freq + kit.phase) * 0.06;
            x = midX + perpX * (kit.perpPos + osc);
            z = midZ + perpZ * (kit.perpPos + osc);
          } else {
            const routT = clamp01(routElapsed / ROUT_MS);
            if (winning) {
              const push = routT * PUSH_THROUGH_FRACTION * dist;
              x = midX + fwdX * push + perpX * kit.perpPos;
              z = midZ + fwdZ * push + perpZ * kit.perpPos;
            } else {
              const retreat = routT * RETREAT_FRACTION * dist;
              const scatter = 1 + routT * 2.2;
              x = startX - fwdX * retreat + perpX * kit.perpPos * scatter;
              z = startZ - fwdZ * retreat + perpZ * kit.perpPos * scatter;
              scale = 1 - routT;
            }
          }

          tmpPos.set(x, midY, z);
          tmpScale.set(scale, scale, scale);
          tmpM.compose(tmpPos, identityQuat, tmpScale);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          mesh.setMatrixAt(writeIndex, tmpM);
          mesh.setColorAt(writeIndex, tmpColor);
          if (isAttacker) atkWrite++; else defWrite++;
        }
      }

      // Glyph/rune burst: only during the clash window, staggered per-shard
      // via its own hashed spawn offset so bursts feel continuous rather than
      // one synchronized pop.
      if (nowMs >= b.clashAt && nowMs < clashEndAt) {
        const clashT = clamp01((nowMs - b.clashAt) / CLASH_MS);
        for (let j = 0; j < SHARDS_PER_BATTLE; j++) {
          const kit = shardKitFor(slot, j);
          const localT = (clashT - kit.spawnT) / kit.life;
          if (localT < 0 || localT > 1) continue;
          const rise = Math.sin(localT * Math.PI); // 0 -> 1 -> 0 pop
          const r = kit.dist * localT;
          const x = midX + Math.cos(kit.angle) * r;
          const z = midZ + Math.sin(kit.angle) * r;
          const y = midY + SHARD_Y_OFFSET + localT * 0.05;
          tmpPos.set(x, y, z);
          tmpScale.setScalar(rise);
          tmpQuat.setFromAxisAngle(UP_AXIS, kit.angle * 3 + localT * 4);
          tmpM.compose(tmpPos, tmpQuat, tmpScale);
          if (kit.variant === 0) { shardMeshA.setMatrixAt(shardAWrite, tmpM); shardAWrite++; }
          else { shardMeshB.setMatrixAt(shardBWrite, tmpM); shardBWrite++; }
        }
      }
    }

    // Sieges still counting down with no resolved outcome yet: an
    // indefinite clash-oscillation loop at the midpoint, no approach/rout,
    // no glyph bursts — visually distinct from a battle that's resolving.
    for (let s = 0; s < skirmishes.length && slot < MAX_CONCURRENT_BATTLES; s++, slot++) {
      const b = skirmishes[s]!;
      const dirX = b.tgtWorldX - b.srcWorldX;
      const dirZ = b.tgtWorldZ - b.srcWorldZ;
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dist < 0.001) continue;
      const perpX = -(dirZ / dist);
      const perpZ = dirX / dist;
      const midX = (b.srcWorldX + b.tgtWorldX) * 0.5;
      const midZ = (b.srcWorldZ + b.tgtWorldZ) * 0.5;
      const midY = (b.srcSurfaceY + b.tgtSurfaceY) * 0.5 + DOT_Y_OFFSET;

      for (let side = 0 as 0 | 1; side < 2; side++) {
        const isAttacker = side === 0;
        const mesh = isAttacker ? attackerMesh : defenderMesh;
        tmpColor.set(isAttacker ? b.attackerColor : b.defenderColor);

        for (let i = 0; i < DOTS_PER_SIDE; i++) {
          const kit = dotKitFor(b.hashSeed, side, i);
          const osc = Math.sin(nowMs / kit.freq + kit.phase) * 0.06;
          const x = midX + perpX * (kit.perpPos + osc);
          const z = midZ + perpZ * (kit.perpPos + osc);

          tmpPos.set(x, midY, z);
          tmpScale.set(1, 1, 1);
          tmpM.compose(tmpPos, identityQuat, tmpScale);
          const writeIndex = isAttacker ? atkWrite : defWrite;
          mesh.setMatrixAt(writeIndex, tmpM);
          mesh.setColorAt(writeIndex, tmpColor);
          if (isAttacker) atkWrite++; else defWrite++;
        }
      }
    }

    attackerMesh.count = atkWrite;
    defenderMesh.count = defWrite;
    shardMeshA.count = shardAWrite;
    shardMeshB.count = shardBWrite;
    attackerMesh.instanceMatrix.needsUpdate = true;
    defenderMesh.instanceMatrix.needsUpdate = true;
    shardMeshA.instanceMatrix.needsUpdate = true;
    shardMeshB.instanceMatrix.needsUpdate = true;
    if (attackerMesh.instanceColor) attackerMesh.instanceColor.needsUpdate = true;
    if (defenderMesh.instanceColor) defenderMesh.instanceColor.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(attackerMesh, defenderMesh, shardMeshA, shardMeshB);
    dotGeom.dispose();
    shardGeom.dispose();
    attackerMat.dispose();
    defenderMat.dispose();
    shardMatA.dispose();
    shardMatB.dispose();
  };

  return { tick, clear, dispose };
}

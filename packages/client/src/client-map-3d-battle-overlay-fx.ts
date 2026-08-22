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

// Renders every concurrently active combat as a lining-up/marching/colliding/
// routing pair of dot swarms plus a small glyph-burst flourish, driven
// entirely by server-resolved outcomes (see CombatBroadcastPayload in
// @border-empires/sim-protocol and client-battle-overlay.ts for how
// state.activeBattles gets populated). The animation never decides anything —
// attackerWon is already known before the first frame renders; this module
// only stages the reveal.
//
// The whole fight happens on the target tile — the tile under attack — never
// spilling onto the attacker's or any neighboring tile; see TILE_LOCAL_MAX.
//
// Timeline per battle (all relative to its own startAt):
//   [0, LINEUP_MS)                          — lineup: both sides form up at their own tile-local edge
//   [LINEUP_MS, APPROACH_MS)                — march: both sides advance from their edge toward the target tile's center
//   [APPROACH_MS, APPROACH_MS+CLASH_MS)     — clash: oscillating melee at the tile center + glyph bursts; some dots are lost
//   [APPROACH_MS+CLASH_MS, endAt)           — rout: winner pushes through, loser scatters/collapses
// A battle that picks up from an already-visible pre-resolution skirmish (see
// BattleOverlaySkirmishEntry and client-battle-overlay.ts) continues that
// skirmish's own lineup/march/clash trajectory exactly (same startAt) instead
// of restarting it — in the overwhelmingly common case the skirmish's own
// lineup+march already finished, so this lands straight in the clash phase,
// but either way the dots never jump. Casualties (see WINNER/LOSER_DEATH_
// FRACTION) only ever happen once the outcome is known — the skirmish's own
// indefinite pre-resolution clash loop never kills a dot, since attrition
// implies a fight that's ending and this one deliberately isn't yet.
export const LINEUP_MS = 2500;
export const MARCH_MS = 900;
export const APPROACH_MS = LINEUP_MS + MARCH_MS;
export const CLASH_MS = 1300;
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
const PUSH_THROUGH_FRACTION = 0.3;
const RETREAT_FRACTION = 0.34;
// Fraction of ROUT_MS spent blending out of the clash's oscillating jostle
// (see clashLocalXZ) rather than dropping it the instant rout begins — see
// where it's used below.
const ROUT_SETTLE_T = 0.15;
const SHARD_Y_OFFSET = 0.14;
const SHARD_SIZE = 0.055;
const UP_AXIS = new Vector3(0, 1, 0);

// Every dot position is computed in tile-local space (origin at the target
// tile's own center — the tile under attack) and clamped to this box before
// being placed in world space. This is what keeps the whole fight, including
// approach/push-through/scatter, from ever spilling onto neighboring tiles —
// matches the muster overlay's own tile-local [-0.46, 0.46] convention for
// the same 1x1-world-unit tile footprint.
const TILE_LOCAL_MAX = 0.46;
const clampLocal = (v: number): number => Math.max(-TILE_LOCAL_MAX, Math.min(TILE_LOCAL_MAX, v));

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
  // Stable per-tile hash seed (target tile coordinates), NOT an array index —
  // see BattleOverlaySkirmishEntry.hashSeed below for why. Also, critically,
  // this must be derived the same way a preceding skirmish's hashSeed was:
  // when a resolved battle picks up right where its skirmish left off (see
  // client-battle-overlay.ts), matching seeds keep every dot's offset/perp/
  // freq/phase identical across the transition so the clash doesn't jump.
  hashSeed: number;
};

// A siege still counting down to its resolution tick — the server hasn't
// broadcast a CombatBroadcastPayload yet (that only fires once, at
// resolveLock), so the outcome is unknown. Plays the same lineup-then-march
// approach as a resolved battle (see LINEUP_MS/APPROACH_MS below) once,
// starting from `startAt`, then settles into an indefinite clash-oscillation
// loop at the tile center for the rest of the countdown, with no rout phase,
// no glyph bursts, and no casualties, so it reads as "still contested" rather
// than "just resolved".
export type BattleOverlaySkirmishEntry = {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  // When this client first started rendering this skirmish (its own clock,
  // e.g. performance.now()) — drives the one-time approach phase below.
  // Intentionally NOT tied to the siege's actual server-side start time: a
  // client that opens mid-siege should still see a fresh approach on its
  // first frame rather than a jump-cut into an already-oscillating melee.
  startAt: number;
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
type DeathKit = { roll: number; at: number };

// How long, as a fraction of LINEUP_MS, a dot takes to pop into formation at
// its tile-local edge — staggered per-dot by kit.offset so the line forms up
// raggedly rather than every dot appearing in lockstep. Holds in formation,
// static but for a small idle sway (LINEUP_SWAY_AMPLITUDE), for the rest of
// lineup.
const LINEUP_POP_T = 0.25;
const LINEUP_SWAY_AMPLITUDE = 0.015;

// Shared by both the resolved-battle lineup phase and the pre-resolution
// skirmish's one-time lineup: holds a dot at its tile-local edge formation
// position (a fixed spot — this phase is about forming ranks, not moving)
// while popping it in and giving it a small idle sway, staggered per-dot by
// kit.offset. Kept as one function so the two call sites can't drift apart.
const lineupLocalXZ = (
  entryLocalX: number,
  entryLocalZ: number,
  lineupT: number,
  kit: DotKit,
  perpX: number,
  perpZ: number,
  nowMs: number
): [number, number, number] => {
  const scale = clamp01((lineupT - kit.offset * 0.6) / LINEUP_POP_T);
  const sway = Math.sin(nowMs / (kit.freq * 2) + kit.phase) * LINEUP_SWAY_AMPLITUDE;
  return [
    entryLocalX + perpX * (kit.perpPos + sway),
    entryLocalZ + perpZ * (kit.perpPos + sway),
    scale
  ];
};

// Shared by both the resolved-battle march phase and the pre-resolution
// skirmish's one-time march: interpolates a dot from its tile-local edge
// (where lineup left it) to its clash formation position (reaching formation
// at marchT === FORMATION_T, staggered per-dot by kit.offset), then holds
// there for the remainder of the march window. Kept as one function so the
// two call sites can't drift out of sync with each other.
const marchLocalXZ = (
  entryLocalX: number,
  entryLocalZ: number,
  marchT: number,
  kit: DotKit,
  perpX: number,
  perpZ: number
): [number, number] => {
  const localT = clamp01((marchT - kit.offset) / (FORMATION_T - kit.offset));
  return [
    entryLocalX * (1 - localT) + perpX * kit.perpPos,
    entryLocalZ * (1 - localT) + perpZ * kit.perpPos
  ];
};

// How far each side's clash formation sits from the tile's exact center,
// along the attacker-defender line (fwdX/fwdZ — each side's own forward
// direction through the clash point). Without this, both sides' oscillation
// only ever varies the *perpendicular* spread (perpX/perpZ), so a dot with a
// given perpPos lands on the exact same point regardless of side — the two
// swarms sit fully coincident all through the clash, and with depthTest
// disabled on both materials, whichever mesh draws second fully hides the
// other (verified in the Storybook "Full Attack Lifecycle" story: the
// attacker's dots were never visible during the clash phase, only during
// rout once the two sides actually separate). Pulling each side back along
// its own forward axis keeps them as two distinct, pressed-together lines —
// still "meeting in the middle", just not literally stacked — and the extra
// jitter term (its own frequency/phase offset from the perpendicular one)
// reads as the line jostling forward into contact and back.
const CLASH_LINE_DEPTH = 0.09;
const CLASH_LINE_JITTER = 0.03;

// Shared by the resolved-battle clash phase and the pre-resolution
// skirmish's clash loop, for the same reason approachLocalXZ is shared: one
// formula, so the two can't drift apart.
const clashLocalXZ = (kit: DotKit, nowMs: number, perpX: number, perpZ: number, fwdX: number, fwdZ: number): [number, number] => {
  const spread = Math.sin(nowMs / kit.freq + kit.phase) * 0.06;
  const depth = CLASH_LINE_DEPTH + Math.sin(nowMs / (kit.freq * 0.6) + kit.phase * 1.7) * CLASH_LINE_JITTER;
  return [
    perpX * (kit.perpPos + spread) - fwdX * depth,
    perpZ * (kit.perpPos + spread) - fwdZ * depth
  ];
};

// Casualties during a resolved battle's clash: only ever decided once the
// outcome is known (never for the skirmish's own indefinite pre-resolution
// clash loop — see the module comment above), and biased toward the losing
// side so the swarm visibly thins in the loser's favor before rout makes it
// explicit. Fixed COUNTS rather than independent per-dot probabilities:
// DOTS_PER_SIDE is only 10, and 10 independent 50%-ish coin flips has a
// real chance of wiping a side to zero — which then leaves nothing for rout
// to visibly scatter, undercutting the whole point of that phase (caught via
// the Storybook "Full Attack Lifecycle" story). Picking the N dots with the
// lowest death roll guarantees exactly N deaths every time (still random
// *which* N, and *when* within the clash window, via each dot's own kit),
// while always leaving DOTS_PER_SIDE - N survivors to scatter or push
// through.
const WINNER_DEATHS = 2;
const LOSER_DEATHS = 4;
// How long, as a fraction of CLASH_MS, a dying dot takes to shrink away once
// its death moment (DeathKit.at) arrives.
const DEATH_FADE_T = 0.12;

// The set of dot indices (0..DOTS_PER_SIDE) that die this clash for one
// side: the N lowest death rolls, where N depends on whether this side is
// winning. Computed once per side per battle (not per dot, not per frame-
// dependent — hashSeed/side/winning are all that determine it), so the
// clash-phase fade-out and the rout-phase "stay gone" check always agree.
const dyingIndicesFor = (
  deathKitFor: (side: 0 | 1, i: number) => DeathKit,
  side: 0 | 1,
  winning: boolean
): Set<number> => {
  const n = winning ? WINNER_DEATHS : LOSER_DEATHS;
  const ranked = Array.from({ length: DOTS_PER_SIDE }, (_, i) => ({ i, roll: deathKitFor(side, i).roll }));
  ranked.sort((a, b) => a.roll - b.roll);
  return new Set(ranked.slice(0, n).map((r) => r.i));
};

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
  const attackerMat = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", depthTest: false, depthWrite: false });
  const defenderMat = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", depthTest: false, depthWrite: false });
  const shardMatA = new MeshBasicMaterial({ toneMapped: false, color: "#ffcf6b", depthTest: false, depthWrite: false, transparent: true });
  const shardMatB = new MeshBasicMaterial({ toneMapped: false, color: "#b388ff", depthTest: false, depthWrite: false, transparent: true });

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

  const dotKitFor = (seed: number, side: 0 | 1, i: number): DotKit => ({
    offset: hash01(seed * 31 + i, side, 3) * 0.22,
    perpPos: (hash01(seed * 31 + i, side, 0) - 0.5) * 0.6,
    freq: 4 + hash01(seed * 31 + i, side, 1) * 8,
    phase: hash01(seed * 31 + i, side, 2) * Math.PI * 2,
  });

  const shardKitFor = (seed: number, j: number): ShardKit => ({
    spawnT: hash01(seed * 53 + j, 7, 11),
    angle: hash01(seed * 53 + j, 7, 13) * Math.PI * 2,
    dist: 0.08 + hash01(seed * 53 + j, 7, 17) * 0.18,
    life: 0.28 + hash01(seed * 53 + j, 7, 19) * 0.2,
    variant: (j % 2) as 0 | 1,
  });

  const deathKitFor = (seed: number, side: 0 | 1, i: number): DeathKit => ({
    roll: hash01(seed * 31 + i, side, 23),
    at: hash01(seed * 31 + i, side, 29),
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
      // The fight lives on the target tile — the tile under attack — not at
      // the midpoint between attacker and defender territory.
      const tileX = b.tgtWorldX;
      const tileZ = b.tgtWorldZ;
      const tileY = b.tgtSurfaceY + DOT_Y_OFFSET;

      const clashEndAt = b.clashAt + CLASH_MS;
      const routElapsed = nowMs - clashEndAt;

      for (let side = 0 as 0 | 1; side < 2; side++) {
        const isAttacker = side === 0;
        const winning = isAttacker ? b.attackerWon : !b.attackerWon;
        // Attacker enters from the tile-local edge facing their origin;
        // defender starts from the opposite edge. Both converge on the
        // tile's own center for the clash.
        const entryLocalX = isAttacker ? -ux * TILE_LOCAL_MAX : ux * TILE_LOCAL_MAX;
        const entryLocalZ = isAttacker ? -uz * TILE_LOCAL_MAX : uz * TILE_LOCAL_MAX;
        // Each side's own forward direction through the clash point.
        const fwdX = isAttacker ? ux : -ux;
        const fwdZ = isAttacker ? uz : -uz;
        const mesh = isAttacker ? attackerMesh : defenderMesh;
        tmpColor.set(isAttacker ? b.attackerColor : b.defenderColor);
        const dyingIndices = dyingIndicesFor((s, i) => deathKitFor(b.hashSeed, s, i), side, winning);

        for (let i = 0; i < DOTS_PER_SIDE; i++) {
          const kit = dotKitFor(b.hashSeed, side, i);
          const deathKit = deathKitFor(b.hashSeed, side, i);
          const dies = dyingIndices.has(i);
          let lx: number;
          let lz: number;
          let scale = 1;

          if (nowMs < b.startAt + LINEUP_MS) {
            const lineupT = clamp01((nowMs - b.startAt) / LINEUP_MS);
            [lx, lz, scale] = lineupLocalXZ(entryLocalX, entryLocalZ, lineupT, kit, perpX, perpZ, nowMs);
          } else if (nowMs < b.clashAt) {
            const marchT = clamp01((nowMs - b.startAt - LINEUP_MS) / MARCH_MS);
            [lx, lz] = marchLocalXZ(entryLocalX, entryLocalZ, marchT, kit, perpX, perpZ);
          } else if (nowMs < clashEndAt) {
            const clashT = clamp01((nowMs - b.clashAt) / CLASH_MS);
            [lx, lz] = clashLocalXZ(kit, nowMs, perpX, perpZ, fwdX, fwdZ);
            if (dies && clashT >= deathKit.at) scale = 1 - clamp01((clashT - deathKit.at) / DEATH_FADE_T);
          } else if (dies) {
            // Already fell during the clash above — stays gone through rout.
            lx = 0;
            lz = 0;
            scale = 0;
          } else {
            const routT = clamp01(routElapsed / ROUT_MS);
            let routLx: number;
            let routLz: number;
            if (winning) {
              const push = routT * PUSH_THROUGH_FRACTION;
              routLx = fwdX * push + perpX * kit.perpPos;
              routLz = fwdZ * push + perpZ * kit.perpPos;
            } else {
              const retreat = routT * RETREAT_FRACTION;
              const scatter = 1 + routT * 1.6;
              routLx = entryLocalX - fwdX * retreat + perpX * kit.perpPos * scatter;
              routLz = entryLocalZ - fwdZ * retreat + perpZ * kit.perpPos * scatter;
              scale = 1 - routT;
            }
            // The clash oscillation (spread + forward jostle) doesn't just
            // vanish the instant rout starts: blend from wherever it was
            // frozen at the exact clash/rout boundary into the clean rout
            // trajectory above, over the first ROUT_SETTLE_T of rout. Without
            // this a dot mid-sway at clashEndAt would visibly pop straight
            // onto the rout line.
            const settleT = clamp01(routT / ROUT_SETTLE_T);
            if (settleT < 1) {
              const [clashLx, clashLz] = clashLocalXZ(kit, clashEndAt, perpX, perpZ, fwdX, fwdZ);
              lx = clashLx * (1 - settleT) + routLx * settleT;
              lz = clashLz * (1 - settleT) + routLz * settleT;
            } else {
              lx = routLx;
              lz = routLz;
            }
          }

          tmpPos.set(tileX + clampLocal(lx), tileY, tileZ + clampLocal(lz));
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
          const kit = shardKitFor(b.hashSeed, j);
          const localT = (clashT - kit.spawnT) / kit.life;
          if (localT < 0 || localT > 1) continue;
          const rise = Math.sin(localT * Math.PI); // 0 -> 1 -> 0 pop
          const r = kit.dist * localT;
          const x = tileX + clampLocal(Math.cos(kit.angle) * r);
          const z = tileZ + clampLocal(Math.sin(kit.angle) * r);
          const y = tileY + SHARD_Y_OFFSET + localT * 0.05;
          tmpPos.set(x, y, z);
          tmpScale.setScalar(rise);
          tmpQuat.setFromAxisAngle(UP_AXIS, kit.angle * 3 + localT * 4);
          tmpM.compose(tmpPos, tmpQuat, tmpScale);
          if (kit.variant === 0) { shardMeshA.setMatrixAt(shardAWrite, tmpM); shardAWrite++; }
          else { shardMeshB.setMatrixAt(shardBWrite, tmpM); shardBWrite++; }
        }
      }
    }

    // Sieges still counting down with no resolved outcome yet: a one-time
    // lineup-then-march (both sides form up, then advance to the tile center
    // — same formula as a resolved battle's lineup/march phases) followed by
    // an indefinite clash-oscillation loop for the rest of the countdown —
    // no rout, no glyph bursts, no casualties, visually distinct from a
    // battle that's resolving. Uses the exact same tile-local clash formula
    // (and hashSeed) as the resolved-battle clash phase above, so a battle
    // that picks up from a live skirmish (see client-battle-overlay.ts)
    // continues seamlessly instead of jumping.
    for (let s = 0; s < skirmishes.length && slot < MAX_CONCURRENT_BATTLES; s++, slot++) {
      const b = skirmishes[s]!;
      const dirX = b.tgtWorldX - b.srcWorldX;
      const dirZ = b.tgtWorldZ - b.srcWorldZ;
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dist < 0.001) continue;
      const ux = dirX / dist;
      const uz = dirZ / dist;
      const perpX = -uz;
      const perpZ = ux;
      const tileX = b.tgtWorldX;
      const tileZ = b.tgtWorldZ;
      const tileY = b.tgtSurfaceY + DOT_Y_OFFSET;
      const elapsed = nowMs - b.startAt;

      for (let side = 0 as 0 | 1; side < 2; side++) {
        const isAttacker = side === 0;
        // Same tile-local entry edges as the resolved-battle lineup: the
        // attacker enters facing their origin, the defender from the
        // opposite edge, both converging on the tile center.
        const entryLocalX = isAttacker ? -ux * TILE_LOCAL_MAX : ux * TILE_LOCAL_MAX;
        const entryLocalZ = isAttacker ? -uz * TILE_LOCAL_MAX : uz * TILE_LOCAL_MAX;
        // Each side's own forward direction through the clash point.
        const fwdX = isAttacker ? ux : -ux;
        const fwdZ = isAttacker ? uz : -uz;
        const mesh = isAttacker ? attackerMesh : defenderMesh;
        tmpColor.set(isAttacker ? b.attackerColor : b.defenderColor);

        for (let i = 0; i < DOTS_PER_SIDE; i++) {
          const kit = dotKitFor(b.hashSeed, side, i);
          let lx: number;
          let lz: number;
          let scale = 1;

          if (elapsed < LINEUP_MS) {
            const lineupT = clamp01(elapsed / LINEUP_MS);
            [lx, lz, scale] = lineupLocalXZ(entryLocalX, entryLocalZ, lineupT, kit, perpX, perpZ, nowMs);
          } else if (elapsed < APPROACH_MS) {
            const marchT = clamp01((elapsed - LINEUP_MS) / MARCH_MS);
            [lx, lz] = marchLocalXZ(entryLocalX, entryLocalZ, marchT, kit, perpX, perpZ);
          } else {
            [lx, lz] = clashLocalXZ(kit, nowMs, perpX, perpZ, fwdX, fwdZ);
          }

          tmpPos.set(tileX + clampLocal(lx), tileY, tileZ + clampLocal(lz));
          tmpScale.set(scale, scale, scale);
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
    attackerMesh.instanceMatrix.clearUpdateRanges();
    attackerMesh.instanceMatrix.addUpdateRange(0, attackerMesh.count * 16);
    attackerMesh.instanceMatrix.needsUpdate = true;
    defenderMesh.instanceMatrix.clearUpdateRanges();
    defenderMesh.instanceMatrix.addUpdateRange(0, defenderMesh.count * 16);
    defenderMesh.instanceMatrix.needsUpdate = true;
    shardMeshA.instanceMatrix.clearUpdateRanges();
    shardMeshA.instanceMatrix.addUpdateRange(0, shardMeshA.count * 16);
    shardMeshA.instanceMatrix.needsUpdate = true;
    shardMeshB.instanceMatrix.clearUpdateRanges();
    shardMeshB.instanceMatrix.addUpdateRange(0, shardMeshB.count * 16);
    shardMeshB.instanceMatrix.needsUpdate = true;
    if (attackerMesh.instanceColor) {
      attackerMesh.instanceColor.clearUpdateRanges();
      attackerMesh.instanceColor.addUpdateRange(0, attackerMesh.count * 3);
      attackerMesh.instanceColor.needsUpdate = true;
    }
    if (defenderMesh.instanceColor) {
      defenderMesh.instanceColor.clearUpdateRanges();
      defenderMesh.instanceColor.addUpdateRange(0, defenderMesh.count * 3);
      defenderMesh.instanceColor.needsUpdate = true;
    }
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

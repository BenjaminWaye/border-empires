import { WORLD_HEIGHT, WORLD_WIDTH, terrainAt } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { APPROACH_MS, clamp01, clampLocal, marineKitFor, stopOffsetFor, type MarinePose } from "../client-map-3d-popup-marine/popup-marine-timeline.js";

export type LandingPoint = { x: number; z: number };
/** Route and positions are relative to the destination tile's centre. */
export type DockLanding = {
  startAt: number;
  inwardX: number;
  inwardZ: number;
  route: readonly LandingPoint[];
};
export const SAIL_MS = 1300;
export const RAMP_MS = 500;
const BERTH_DISTANCE = 0.72;

/** Require a real linked-dock crossing; attacking a dock over land is ordinary combat. */
export function dockLandingFor(
  state: Pick<ClientState, "dockPairs" | "tiles">,
  srcX: number, srcY: number, targetX: number, targetY: number, startAt: number
): DockLanding | undefined {
  const dx = toroidDelta(srcX, targetX, WORLD_WIDTH);
  const dz = toroidDelta(srcY, targetY, WORLD_HEIGHT);
  if (Math.max(Math.abs(dx), Math.abs(dz)) <= 1) return undefined;
  const pair = state.dockPairs?.find((p) =>
    (p.ax === srcX && p.ay === srcY && p.bx === targetX && p.by === targetY) ||
    (p.bx === srcX && p.by === srcY && p.ax === targetX && p.ay === targetY));
  if (!pair) return undefined;
  const reversed = pair.ax !== srcX || pair.ay !== srcY;
  const route = reversed ? [...(pair.route ?? [])].reverse() : pair.route ?? [];
  const sea = (x: number, y: number): boolean => {
    const wx = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
    const wy = ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
    const terrain = state.tiles.get(`${wx},${wy}`)?.terrain ?? terrainAt(wx, wy);
    return terrain === "SEA" || terrain === "COASTAL_SEA";
  };
  // Do not draw a fabricated straight route over islands. Older payloads
  // without a sea path get just the final approach from a known sea neighbour.
  // Server waypoints already encode the frozen world's sea. Do not filter
  // them through procedural client terrain, which may disagree with it.
  const lastSea = [...route].reverse().find((p) => p.x !== targetX || p.y !== targetY);
  const shore = lastSea ?? [{ x: targetX, y: targetY + 1 }, { x: targetX + 1, y: targetY },
    { x: targetX, y: targetY - 1 }, { x: targetX - 1, y: targetY }].find((p) => sea(p.x, p.y));
  if (!shore) return undefined;
  const sx = toroidDelta(targetX, shore.x, WORLD_WIDTH);
  const sz = toroidDelta(targetY, shore.y, WORLD_HEIGHT);
  const length = Math.hypot(sx, sz);
  const inwardX = -sx / length;
  const inwardZ = -sz / length;
  // Beach beside the pier, keeping the bow clear of the dock's centre.
  const berthDistance = Math.max(BERTH_DISTANCE, length - 0.28);
  const berth = { x: -inwardX * berthDistance + inwardZ * 0.45,
    z: -inwardZ * berthDistance - inwardX * 0.45 };
  // Unwrap backwards from the landing so a route crossing the world seam
  // stays continuous and ends at the correct beach.
  const points: LandingPoint[] = [];
  let x = targetX; let y = targetY; let px = 0; let pz = 0;
  const seaRoute = route;
  for (let i = seaRoute.length - 1; i >= 0; i--) {
    const p = seaRoute[i]!;
    px += toroidDelta(x, p.x, WORLD_WIDTH);
    pz += toroidDelta(y, p.y, WORLD_HEIGHT);
    points.push({ x: px, z: pz }); x = p.x; y = p.y;
  }
  points.reverse();
  if (points.length === 0) points.push({ x: sx, z: sz });
  points.push(berth);
  return { startAt, inwardX, inwardZ, route: points };
}

export function landingCarrierPose(landing: DockLanding, nowMs: number): LandingPoint & { yaw: number; rampOpen: number } {
  const t = clamp01((nowMs - landing.startAt) / SAIL_MS);
  const route = landing.route;
  const lengths = route.slice(1).map((p, i) => Math.hypot(p.x - route[i]!.x, p.z - route[i]!.z));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * t;
  let a = route[0]!; let b = route[route.length - 1]!;
  let mix = 1;
  for (let i = 0; i < lengths.length; i++) {
    a = route[i]!; b = route[i + 1]!;
    const length = lengths[i]!;
    if (remaining <= length || i === lengths.length - 1) { mix = length > 0 ? clamp01(remaining / length) : 1; break; }
    remaining -= length;
  }
  return { x: a.x + (b.x - a.x) * mix, z: a.z + (b.z - a.z) * mix,
    yaw: t >= 1 ? Math.atan2(landing.inwardX, landing.inwardZ) : Math.atan2(b.x - a.x, b.z - a.z),
    rampOpen: clamp01((nowMs - landing.startAt - SAIL_MS) / RAMP_MS) };
}

/** Walk from the cargo bay in two files, fan out, then join the existing firing line. */
export function landingMarinePose(base: MarinePose, landing: DockLanding | undefined, index: number, nowMs: number, hashSeed = 0): MarinePose {
  if (!landing) return base;
  const elapsed = nowMs - landing.startAt;
  if (elapsed >= APPROACH_MS) return base;
  const departAt = SAIL_MS + RAMP_MS + Math.floor(index / 2) * 180;
  const t = clamp01((elapsed - departAt) / (APPROACH_MS - departAt));
  const lane = (index % 2 === 0 ? -1 : 1) * 0.055;
  const berth = landing.route[landing.route.length - 1]!;
  const fromX = berth.x + landing.inwardX * 0.19 - landing.inwardZ * lane;
  const fromZ = berth.z + landing.inwardZ * 0.19 + landing.inwardX * lane;
  if (elapsed < departAt) return { ...base, scale: 0, flash: 0 };
  const kit = marineKitFor(hashSeed, 0, index);
  const firingX = clampLocal(-landing.inwardZ * kit.perpPos - landing.inwardX * stopOffsetFor(kit));
  const firingZ = clampLocal(landing.inwardX * kit.perpPos - landing.inwardZ * stopOffsetFor(kit));
  // Stay inside the two ramp lanes until reaching sand; only then fan out.
  const exitX = berth.x + landing.inwardX * 0.56 - landing.inwardZ * lane;
  const exitZ = berth.z + landing.inwardZ * 0.56 + landing.inwardX * lane;
  const rampT = clamp01(t / 0.55);
  const shoreT = clamp01((t - 0.55) / 0.45);
  const localX = t < 0.55 ? fromX * (1 - rampT) + exitX * rampT : exitX * (1 - shoreT) + firingX * shoreT;
  const localZ = t < 0.55 ? fromZ * (1 - rampT) + exitZ * rampT : exitZ * (1 - shoreT) + firingZ * shoreT;
  const alongRamp = (localX - berth.x) * landing.inwardX + (localZ - berth.z) * landing.inwardZ;
  return { ...base, localX, localZ, localY: clamp01((0.54 - alongRamp) / 0.24) * 0.055, scale: 1, flash: 0,
    stance: t < 1 ? "run" : base.stance,
    yaw: t < 0.55 ? Math.atan2(landing.inwardX, landing.inwardZ) : Math.atan2(firingX - exitX, firingZ - exitZ) };
}

/** The battle axes must point inland, regardless of the remote departure dock. */
export function landingBattleSource(landing: DockLanding | undefined, targetX: number, targetZ: number, srcX: number, srcZ: number): LandingPoint {
  return landing ? { x: targetX - landing.inwardX, z: targetZ - landing.inwardZ } : { x: srcX, z: srcZ };
}

/** A moving vessel, unlike a route polyline, needs its own nearest world copy. */
export function landingCarrierScenePoint(targetX: number, targetZ: number, pose: LandingPoint): LandingPoint {
  const centered = (value: number, size: number): number => ((value + size / 2) % size + size) % size - size / 2;
  return { x: centered(targetX + pose.x, WORLD_WIDTH), z: centered(targetZ + pose.z, WORLD_HEIGHT) };
}

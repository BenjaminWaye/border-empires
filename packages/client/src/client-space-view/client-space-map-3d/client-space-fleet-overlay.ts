// In-flight fleet overlay: renders each TRAVELING fleet order as a small
// formation of its hull-class ship models, moving in a straight line from
// its origin to its target and oriented to face the direction of travel.
// Kept separate from client-space-fleet-hull-mesh.ts (per-hull-class model
// factories) the same way client-space-solar-system.ts is split from
// client-space-planet-mesh.ts: this module owns per-order state (position,
// formation layout) and per-frame movement, the hull-mesh module owns pure
// per-hull-class geometry.
//
// JUDGMENT CALL -- straight-line flight with no real distance model: same
// caveat as galaxy-fleet-config.ts's travel-time comment. There is no
// galactic coordinate system backing this; a fleet's course is a straight
// line between two points from the same deterministic, purely-visual
// layout hash every territory already uses (`galaxyLayoutPosition` /
// `fleetOriginPosition`). Position is driven by real wall-clock time
// (`departsAt`/`arrivesAt`), not the scene's animation clock, so a fleet
// visually lands exactly when its order actually resolves server-side.
import { Group, Object3D, Quaternion, Vector3 } from "three";
import { createFleetHullMesh, disposeFleetHullMesh, type FleetHullMeshEntry } from "./client-space-fleet-hull-mesh.js";
import { fleetOriginPosition, galaxyLayoutPosition, type Vec3 } from "../client-space-view-state.js";
import { FLEET_HULL_CLASS_IDS, type FleetHullClassId } from "../../client-fleet-panel/client-fleet-panel-html.js";

export type FleetOverlayOrder = {
  id: string;
  ownerAuthUid: string;
  originSeasonId?: string;
  targetSeasonId: string;
  composition: Partial<Record<FleetHullClassId, number>>;
  // When the fleet actually starts moving (build time elapsed -- see
  // galaxy-fleet-config.ts's computeFleetBuildTimeMs comment). The overlay
  // sits still at `origin` for any nowMs before this. Falls back to
  // `sentAt` when absent (an order created before build time existed),
  // i.e. "departed immediately".
  departsAt?: number;
  sentAt: number;
  arrivesAt: number;
};

export type FleetOverlayEntry = {
  id: string;
  group: Group;
  origin: Vec3;
  target: Vec3;
  departsAt: number;
  arrivesAt: number;
  hulls: FleetHullMeshEntry[];
};

const FORWARD_AXIS = new Vector3(1, 0, 0);
// Small spread so a mixed composition reads as a formation, not one ship
// model stacked on another.
const FORMATION_OFFSETS: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0.5, z: 0.4 },
  { x: 0, y: -0.5, z: 0.4 },
  { x: 0, y: 0.4, z: -0.5 },
  { x: 0, y: -0.4, z: -0.5 }
];

/**
 * Builds one order's in-flight formation: one ship model per distinct hull
 * class present in the composition (not one per unit -- a 40-Dreadnought
 * raid would otherwise flood the scene with identical meshes for no extra
 * legibility), arranged in a small fixed offset pattern.
 */
export const createFleetOverlay = (order: FleetOverlayOrder): FleetOverlayEntry => {
  const group = new Group();
  const activeHullIds = FLEET_HULL_CLASS_IDS.filter((id) => (order.composition[id] ?? 0) > 0);
  const hulls = activeHullIds.map((hullId, index) => {
    const entry = createFleetHullMesh(hullId);
    const offset = FORMATION_OFFSETS[index % FORMATION_OFFSETS.length]!;
    entry.group.position.set(offset.x, offset.y, offset.z);
    group.add(entry.group);
    return entry;
  });

  const origin = fleetOriginPosition(order.originSeasonId, order.ownerAuthUid);
  const target = galaxyLayoutPosition(order.targetSeasonId);
  group.position.set(origin.x, origin.y, origin.z);

  const direction = new Vector3(target.x - origin.x, target.y - origin.y, target.z - origin.z);
  if (direction.lengthSq() > 0) {
    const quaternion = new Quaternion().setFromUnitVectors(FORWARD_AXIS, direction.normalize());
    group.quaternion.copy(quaternion);
  }

  return { id: order.id, group, origin, target, departsAt: order.departsAt ?? order.sentAt, arrivesAt: order.arrivesAt, hulls };
};

export const disposeFleetOverlay = (entry: FleetOverlayEntry): void => {
  for (const hull of entry.hulls) disposeFleetHullMesh(hull);
};

/**
 * Repositions one fleet along its origin->target line for the given real
 * wall-clock time -- not the scene's own elapsed-seconds animation clock,
 * since a fleet must visually arrive exactly at `arrivesAt`, matching
 * when the server actually resolves the order.
 */
export const animateFleetOverlay = (entry: FleetOverlayEntry, nowMs: number): void => {
  const span = entry.arrivesAt - entry.departsAt;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (nowMs - entry.departsAt) / span)) : 1;
  entry.group.position.set(
    entry.origin.x + (entry.target.x - entry.origin.x) * fraction,
    entry.origin.y + (entry.target.y - entry.origin.y) * fraction,
    entry.origin.z + (entry.target.z - entry.origin.z) * fraction
  );
  // A slow spin on each hull's own local group, layered on top of the
  // formation's fixed heading, so a fleet in transit doesn't look static.
  for (const hull of entry.hulls) {
    (hull.group as Object3D).rotation.x += 0.01;
  }
};

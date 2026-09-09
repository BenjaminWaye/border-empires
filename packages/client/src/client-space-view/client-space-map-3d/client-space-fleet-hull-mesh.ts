// Per-hull-class 3D ship models for Space View's fleet overlay (§6/§12 v2a
// Fleets, extended per user request into a visible in-flight 3D overlay
// instead of the panel-only representation Fleets originally shipped with).
// Every hull is authored nose-first along local +X so client-space-fleet-overlay.ts
// can orient a whole formation with one quaternion rotation from (1,0,0) to
// the travel direction, the same "author along a fixed local axis, let the
// caller orient it" split client-space-solar-system.ts uses for orbit pivots.
import { Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from "three";
import type { FleetHullClassId } from "../../client-fleet-panel/client-fleet-panel-html.js";

export type FleetHullMeshEntry = { hullId: FleetHullClassId; group: Group };

const HULL_COLOR: Record<FleetHullClassId, number> = {
  SCOUT: 0x60a5fa,
  RAIDER: 0xfb923c,
  BATTLELINE: 0x94a3b8,
  DREADNOUGHT: 0xf87171,
  TANKER: 0xa3e635
};

const material = (color: number, emissiveIntensity = 0.35): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, emissive: new Color(color).multiplyScalar(emissiveIntensity), roughness: 0.5, metalness: 0.25 });

// A cone is authored pointing +Y by default -- rotating -90deg around Z
// points its tip along +X, the shared "nose forward" convention every hull
// builder below follows. `x` positions the cone's own center (not its
// base) along that axis, same convention as cylinderAlongX below.
const noseConeAlongX = (radius: number, height: number, color: number, x = 0): Mesh => {
  const mesh = new Mesh(new ConeGeometry(radius, height, 12), material(color));
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.x = x;
  return mesh;
};

const cylinderAlongX = (radius: number, height: number, color: number, x = 0): Mesh => {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, height, 12), material(color));
  mesh.rotation.z = Math.PI / 2;
  mesh.position.x = x;
  return mesh;
};

const buildScout = (): Group => {
  // Small, slender, all-nose -- reads as fast and disposable, matching its
  // recon-only role (no weapons silhouette).
  const group = new Group();
  group.add(noseConeAlongX(0.14, 0.7, HULL_COLOR.SCOUT, 0.175));
  group.add(cylinderAlongX(0.08, 0.35, HULL_COLOR.SCOUT, -0.15));
  return group;
};

const buildRaider = (): Group => {
  // Nose cone + a short, wider body -- a dart shape, fast but with visible mass.
  const group = new Group();
  group.add(noseConeAlongX(0.2, 0.55, HULL_COLOR.RAIDER, 0.1));
  group.add(cylinderAlongX(0.16, 0.5, HULL_COLOR.RAIDER, -0.3));
  return group;
};

const buildBattleline = (): Group => {
  // Blunt box hull -- a plain main-line warship, no ornamentation.
  const group = new Group();
  const hull = new Mesh(new CylinderGeometry(0.26, 0.3, 1.1, 8), material(HULL_COLOR.BATTLELINE, 0.2));
  hull.rotation.z = Math.PI / 2;
  group.add(hull);
  group.add(noseConeAlongX(0.26, 0.3, HULL_COLOR.BATTLELINE, 0.7));
  return group;
};

const buildDreadnought = (): Group => {
  // Largest hull, with two small side spikes for visible bulk/menace --
  // the composition's slowest, most damaging hull (§13), should read as
  // the biggest silhouette in a mixed fleet.
  const group = new Group();
  const hull = new Mesh(new CylinderGeometry(0.42, 0.48, 1.7, 8), material(HULL_COLOR.DREADNOUGHT, 0.3));
  hull.rotation.z = Math.PI / 2;
  group.add(hull);
  group.add(noseConeAlongX(0.42, 0.4, HULL_COLOR.DREADNOUGHT, 1.05));
  for (const side of [1, -1]) {
    const spike = new Mesh(new ConeGeometry(0.1, 0.5, 8), material(HULL_COLOR.DREADNOUGHT, 0.3));
    spike.rotation.z = side * (Math.PI / 2.4);
    spike.position.set(-0.1, side * 0.35, 0);
    group.add(spike);
  }
  return group;
};

const buildTanker = (): Group => {
  // A long plain cylinder with two bulbous tanks -- unmistakably a
  // logistics hull, not a warship, matching its "no combat effect" role.
  const group = new Group();
  group.add(cylinderAlongX(0.22, 1.3, HULL_COLOR.TANKER));
  for (const x of [-0.5, 0.5]) {
    const tank = new Mesh(new SphereGeometry(0.28, 10, 10), material(HULL_COLOR.TANKER, 0.15));
    tank.position.x = x;
    group.add(tank);
  }
  return group;
};

const HULL_BUILDERS: Record<FleetHullClassId, () => Group> = {
  SCOUT: buildScout,
  RAIDER: buildRaider,
  BATTLELINE: buildBattleline,
  DREADNOUGHT: buildDreadnought,
  TANKER: buildTanker
};

/** Builds one hull class's ship model, authored nose-first along local +X. */
export const createFleetHullMesh = (hullId: FleetHullClassId): FleetHullMeshEntry => ({ hullId, group: HULL_BUILDERS[hullId]() });

/** Disposes every geometry/material under a hull mesh's group. */
export const disposeFleetHullMesh = (entry: FleetHullMeshEntry): void => {
  entry.group.traverse((child: Object3D) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      (child.material as MeshStandardMaterial).dispose();
    }
  });
};

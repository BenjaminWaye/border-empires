// The true-3D side of Space View's map markers (design doc §31); the 2D
// strategic map draws the same markers in client-strategic-map-renderer.ts.
// On a system's planet: smoke rising where a raid or Warden got through
// lately, a slow gold ring while one of your builds is under way, a small
// blue Probe circling a system you are watching. On each orbiting body of
// your own systems: a gold ring once a base is established, a brighter glow
// once it is developed, and a pulse while either is being built.
import { DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RingGeometry, SphereGeometry, TorusGeometry } from "three";
import type { BodyMarker, SystemMarkers } from "../client-space-view-markers.js";
import type { SolarSystemEntry } from "./client-space-solar-system.js";

const SMOKE_PUFFS = 7;
const SMOKE_COLOR = 0x6b6560;
const EMBER_COLOR = 0xff6a3d;
const GOLD = 0xd9b25c;
const PROBE_BLUE = 0x8fb8e0;

export type SystemMarkerObjects = {
  planetRoot: Group;
  smoke: Mesh[];
  ember: Mesh | undefined;
  buildRing: Mesh | undefined;
  probe: Object3D | undefined;
  bodyRoots: Group[];
  bodyPulses: Mesh[];
  // Developed bodies glow brighter; restored when the markers are cleared.
  brightened: MeshStandardMaterial[];
};

const radiusOf = (mesh: Mesh): number => (mesh.geometry as SphereGeometry).parameters?.radius ?? 1;

const basic = (color: number, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });

const flatRing = (inner: number, outer: number, color: number, opacity: number): Mesh => {
  const ring = new Mesh(new RingGeometry(inner, outer, 40), basic(color, opacity));
  ring.rotation.x = -Math.PI / 2;
  return ring;
};

const bodyMarkers = (mesh: Mesh, marker: BodyMarker, out: SystemMarkerObjects): void => {
  const r = radiusOf(mesh);
  const root = new Group();
  if (marker.base || marker.developed) root.add(flatRing(r * 1.5, r * 1.7, GOLD, 0.85));
  if (marker.building) {
    const pulse = flatRing(r * 1.9, r * 2.05, GOLD, 0.6);
    root.add(pulse);
    out.bodyPulses.push(pulse);
  }
  if (marker.developed) {
    const material = mesh.material as MeshStandardMaterial;
    material.emissiveIntensity = 3;
    out.brightened.push(material);
  }
  mesh.add(root);
  out.bodyRoots.push(root);
};

export const createSystemMarkers = (entry: SolarSystemEntry, markers: SystemMarkers): SystemMarkerObjects => {
  const r = radiusOf(entry.planet.body);
  const planetRoot = new Group();
  const out: SystemMarkerObjects = { planetRoot, smoke: [], ember: undefined, buildRing: undefined, probe: undefined, bodyRoots: [], bodyPulses: [], brightened: [] };
  if (markers.smoking) {
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const puff = new Mesh(new SphereGeometry(r * 0.35, 8, 6), basic(SMOKE_COLOR, 0.5));
      puff.userData.phase = i / SMOKE_PUFFS;
      planetRoot.add(puff);
      out.smoke.push(puff);
    }
    out.ember = new Mesh(new SphereGeometry(r * 0.3, 10, 8), basic(EMBER_COLOR, 0.7));
    out.ember.position.set(0, r * 0.85, 0);
    planetRoot.add(out.ember);
  }
  if (markers.building) {
    out.buildRing = new Mesh(new TorusGeometry(r * 1.6, r * 0.05, 6, 48), basic(GOLD, 0.9));
    out.buildRing.rotation.x = Math.PI / 2;
    planetRoot.add(out.buildRing);
  }
  if (markers.watched) {
    const pivot = new Object3D();
    const dot = new Mesh(new SphereGeometry(r * 0.16, 8, 6), basic(PROBE_BLUE, 1));
    dot.position.set(r * 2.3, r * 0.4, 0);
    pivot.add(dot);
    planetRoot.add(pivot);
    out.probe = pivot;
  }
  entry.planet.group.add(planetRoot);
  markers.bodies.forEach((marker, index) => {
    const body = entry.decoratives[index];
    if (body) bodyMarkers(body.mesh, marker, out);
  });
  return out;
};

const disposeTree = (root: Object3D): void => {
  root.traverse((node) => {
    if (node instanceof Mesh) {
      node.geometry.dispose();
      (node.material as MeshBasicMaterial).dispose();
    }
  });
  root.removeFromParent();
};

export const disposeSystemMarkers = (objects: SystemMarkerObjects): void => {
  disposeTree(objects.planetRoot);
  for (const root of objects.bodyRoots) disposeTree(root);
  for (const material of objects.brightened) material.emissiveIntensity = 1;
};

// Smoke rises, spreads and fades on a loop; the build ring turns; the Probe
// circles; a body being built pulses.
export const animateSystemMarkers = (objects: SystemMarkerObjects, r: number, elapsedSeconds: number): void => {
  for (const puff of objects.smoke) {
    const phase = puff.userData.phase as number;
    const p = (elapsedSeconds * 0.3 + phase) % 1;
    puff.position.set(Math.sin(phase * 6.283 + elapsedSeconds * 0.6) * r * 0.35 * p, r * 0.8 + p * r * 3.2, Math.cos(phase * 6.283) * r * 0.25 * p);
    puff.scale.setScalar(0.5 + p * 1.8);
    (puff.material as MeshBasicMaterial).opacity = 0.55 * (1 - p);
  }
  if (objects.ember) (objects.ember.material as MeshBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(elapsedSeconds * 7);
  if (objects.buildRing) objects.buildRing.rotation.z = elapsedSeconds * 0.8;
  if (objects.probe) objects.probe.rotation.y = elapsedSeconds * 1.2;
  for (const pulse of objects.bodyPulses) pulse.scale.setScalar(1 + 0.15 * Math.sin(elapsedSeconds * 4));
};

export const planetRadiusOf = (entry: SolarSystemEntry): number => radiusOf(entry.planet.body);

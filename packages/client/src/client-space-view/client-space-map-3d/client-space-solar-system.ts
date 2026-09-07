// Solar system factory: a sun plus orbiting bodies for one territory
// (§16's galaxy screen, extended per user request into a proper system
// rather than one lone sphere per territory). Only one body per system is
// real/interactive — the territory itself, built via createPlanetMesh and
// carrying its seasonId for picking — the rest are purely decorative
// (§18 "system development" would eventually give them mechanics, but
// that's unbuilt; these are visual dressing only, never pickable since
// they carry no seasonId).
//
// An "unknown" (fog-of-war, §17.2) system deliberately skips this entirely
// and stays a single dim, undecorated point — §17.2's "nothing more than
// a star in the backdrop" would be contradicted by advertising how many
// bodies orbit it before it's even charted.
import { Color, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from "three";
import { createPlanetMesh, disposePlanetMesh, animatePlanetMesh, type PlanetMeshEntry } from "./client-space-planet-mesh.js";
import { decorativeOrbitBodyCount, hashSeedForOrbit, type SpacePlanetViewModel, type Vec3 } from "../client-space-view-state.js";

export type SolarSystemEntry = {
  seasonId: string;
  group: Group;
  planet: PlanetMeshEntry;
  planetOrbit: { pivot: Object3D; radius: number; speed: number };
  decoratives: Array<{ pivot: Object3D; mesh: Mesh; radius: number; speed: number }>;
  sun: Mesh | undefined;
};

const SUN_COLOR = 0xfbbf24;

const createOrbitingBody = (radius: number, size: number, color: number, emissiveIntensity: number): { pivot: Object3D; mesh: Mesh } => {
  const pivot = new Object3D();
  const geometry = new SphereGeometry(size, 16, 16);
  const material = new MeshStandardMaterial({ color, emissive: new Color(color).multiplyScalar(emissiveIntensity), roughness: 0.7, metalness: 0.1 });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(radius, 0, 0);
  pivot.add(mesh);
  return { pivot, mesh };
};

/**
 * Builds one system's full visual at `position` (the territory's existing
 * `galaxyLayoutPosition`): a small sun at the origin, the real territory
 * body on its own orbit, and a handful of deterministic decorative bodies
 * on their own orbits further out. `unknown`-state systems skip the sun
 * and decoratives, keeping today's single-dim-point look.
 */
export const createSolarSystem = (planet: SpacePlanetViewModel, position: Vec3): SolarSystemEntry => {
  const group = new Group();
  group.position.set(position.x, position.y, position.z);

  const isFogged = planet.state === "unknown";

  let sun: Mesh | undefined;
  if (!isFogged) {
    const sunGeometry = new SphereGeometry(1, 20, 20);
    const sunMaterial = new MeshStandardMaterial({ color: SUN_COLOR, emissive: new Color(SUN_COLOR).multiplyScalar(1.1), roughness: 0.4 });
    sun = new Mesh(sunGeometry, sunMaterial);
    group.add(sun);
  }

  const planetOrbitRadius = isFogged ? 0 : 3.2;
  const planetOrbitPivot = new Object3D();
  group.add(planetOrbitPivot);
  const planetEntry = createPlanetMesh(planet.seasonId, planet.state, { x: planetOrbitRadius, y: 0, z: 0 });
  planetOrbitPivot.add(planetEntry.group);
  // Slower, more stately orbit than the decoratives — it's the one body a
  // player is actually tracking, so it shouldn't race around distractingly.
  const planetOrbitSpeed = isFogged ? 0 : 0.04;

  const decoratives: SolarSystemEntry["decoratives"] = [];
  if (!isFogged) {
    const count = decorativeOrbitBodyCount(planet.seasonId);
    for (let i = 0; i < count; i++) {
      const seed = hashSeedForOrbit(planet.seasonId, i);
      const radius = 5 + i * 2.1 + (seed % 100) / 100;
      const size = 0.35 + ((seed >>> 8) % 100) / 220;
      const color = [0x94a3b8, 0x78716c, 0x57534e, 0xa8a29e][seed % 4]!;
      const speed = (0.03 + ((seed >>> 16) % 100) / 4000) * (seed % 2 === 0 ? 1 : -1);
      const { pivot, mesh } = createOrbitingBody(radius, size, color, 0.08);
      // Deterministic starting angle so a page reload doesn't visibly
      // "reset" every system's orbit back to the same phase.
      pivot.rotation.y = ((seed >>> 4) % 360) * (Math.PI / 180);
      group.add(pivot);
      decoratives.push({ pivot, mesh, radius, speed });
    }
  }

  return { seasonId: planet.seasonId, group, planet: planetEntry, planetOrbit: { pivot: planetOrbitPivot, radius: planetOrbitRadius, speed: planetOrbitSpeed }, decoratives, sun };
};

export const disposeSolarSystem = (entry: SolarSystemEntry): void => {
  disposePlanetMesh(entry.planet);
  if (entry.sun) {
    entry.sun.geometry.dispose();
    (entry.sun.material as MeshStandardMaterial).dispose();
  }
  for (const { mesh } of entry.decoratives) {
    mesh.geometry.dispose();
    (mesh.material as MeshStandardMaterial).dispose();
  }
};

export const animateSolarSystem = (entry: SolarSystemEntry, elapsedSeconds: number): void => {
  animatePlanetMesh(entry.planet, elapsedSeconds);
  // Matches animatePlanetMesh's own per-frame-assumed-60fps `+= speed *
  // 0.016` convention (see client-space-planet-mesh.ts), rather than
  // deriving an absolute angle from elapsedSeconds, for the same reason:
  // consistency with every other spin/pulse effect already in this scene.
  entry.planetOrbit.pivot.rotation.y += entry.planetOrbit.speed * 0.016;
  for (const { pivot, speed } of entry.decoratives) {
    pivot.rotation.y += speed * 0.016;
  }
};

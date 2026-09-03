// Pure, WebGL-free logic for the Space View screen: gating, deterministic
// galaxy layout, and planet-state classification. Kept separate from
// client-space-view.ts (DOM/network wiring) and the client-space-map-3d/
// scene modules (Three.js) so this is trivially unit-testable.

export type SpaceViewPlanetTier = "PLANET" | "OUTPOST";

// Shape of one entry in the public `GET /hq/galaxy` listing, trimmed to the
// fields Space View actually needs. See apps/realtime-gateway/src/galaxy-routes/
// galaxy-routes.ts (`GalaxyPublicPlanetView` / `GalaxyOutpostView`) for the
// authoritative response shape.
export type PublicGalaxyPlanet = {
  seasonId: string;
  tier: SpaceViewPlanetTier;
  claimed?: boolean;
  planetName?: string | null;
};

// The visual/gameplay state a planet renders as in the 3D scene.
export type SpacePlanetState = "owned" | "contested" | "other" | "frontier";

export type SpacePlanetViewModel = {
  seasonId: string;
  tier: SpaceViewPlanetTier;
  label: string;
  state: SpacePlanetState;
};

/**
 * A player is Space-View-eligible once `GET /hq/galaxy/me` returns at least
 * one Planet record. Outposts/Stipends alone do not unlock it (an Outpost
 * carries no independent Sector to re-enter, and a Stipend is not
 * territory) — Space View's whole point is a navigable galaxy of *held*
 * worlds, so the gate is specifically "owns a Planet".
 */
export const ownsSpaceViewEligiblePlanet = (myPlanets: ReadonlyArray<{ seasonId: string }> | undefined | null): boolean =>
  Boolean(myPlanets && myPlanets.length > 0);

/** FNV-1a — small, dependency-free, stable across runs/platforms. */
const hashSeed = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export type Vec3 = { x: number; y: number; z: number };

/**
 * Deterministic placement on a sphere shell, hashed from the planet's
 * seasonId. `GET /hq/galaxy` carries no position data today (known gap,
 * called out in the PR description) — this stands in for it so the same
 * planet always renders at the same spot for every viewer without any
 * server-side coordinate storage.
 */
export const galaxyLayoutPosition = (seasonId: string, radius = 40): Vec3 => {
  const seed = hashSeed(seasonId);
  // Two independent-looking pseudo-random angles from one hash via
  // different bit windows + irrational multipliers (golden-angle-ish
  // spread) — good enough dispersion for a decorative starfield of nodes,
  // not meant to be a rigorous point-on-sphere sampler.
  const u = ((seed & 0xffff) / 0xffff) * 2 - 1; // [-1, 1] -> cos(theta)
  const theta = Math.acos(u);
  const phi = (((seed >>> 16) & 0xffff) / 0xffff) * Math.PI * 2;
  return {
    x: radius * Math.sin(theta) * Math.cos(phi),
    y: radius * Math.cos(theta),
    z: radius * Math.sin(theta) * Math.sin(phi)
  };
};

/**
 * Classifies a public galaxy planet into the four Space-View render states.
 * `isContested` is an injected predicate rather than a field read off the
 * planet: the backend does not yet expose any contestation/raid signal
 * (Stability/raids are unbuilt — see design doc §7/§18), so the seam is
 * typed and real but always resolves to `false` until that lands. Passing a
 * real predicate later requires no change here.
 */
export const classifyPlanetState = (
  planet: PublicGalaxyPlanet,
  mySeasonIds: ReadonlySet<string>,
  isContested: (seasonId: string) => boolean = () => false
): SpacePlanetState => {
  if (mySeasonIds.has(planet.seasonId)) return "owned";
  if (isContested(planet.seasonId)) return "contested";
  if (planet.tier === "PLANET" && planet.claimed === false) return "frontier";
  return "other";
};

export const toSpacePlanetViewModels = (
  planets: ReadonlyArray<PublicGalaxyPlanet>,
  mySeasonIds: ReadonlySet<string>,
  isContested?: (seasonId: string) => boolean
): SpacePlanetViewModel[] =>
  planets.map((planet) => ({
    seasonId: planet.seasonId,
    tier: planet.tier,
    label: planet.planetName ?? planet.seasonId,
    state: classifyPlanetState(planet, mySeasonIds, isContested)
  }));

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
// "unknown" is the design doc's fog-of-war Unknown tier (§17.2) -- a
// system this account hasn't charted yet, shown as a star with no owner
// or contents. Owned/contested territory is always known regardless of
// charting (you obviously know your own holdings, and Senate proposals
// already name their target publicly) -- fog only ever downgrades
// "other"/"frontier" to "unknown", never those two.
export type SpacePlanetState = "owned" | "contested" | "other" | "frontier" | "unknown";

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
/**
 * How many purely-decorative bodies (gas giants, rocky worlds, moons —
 * §18's "system development" would eventually give these real mechanics,
 * but that's not built, so these are visual dressing only) orbit a given
 * system's sun alongside the one real, interactive planet. Deterministic
 * from the seasonId so every viewer sees the same system, same as
 * `galaxyLayoutPosition`. Range chosen to always read as "a system", not a
 * lonely single body, without ever getting so crowded orbits overlap.
 */
export const decorativeOrbitBodyCount = (seasonId: string): number => 2 + (hashSeed(`orbit:${seasonId}`) % 3);

/**
 * A distinct deterministic seed per (seasonId, decorative-body-index) pair,
 * for varying each orbiting body's radius/size/color/speed without every
 * body in the same system landing on the same hash.
 */
export const hashSeedForOrbit = (seasonId: string, index: number): number => hashSeed(`orbit:${seasonId}:${index}`);

/**
 * Where a fleet order's in-flight 3D overlay launches from. Uses the same
 * deterministic sphere-shell layout as every territory (`galaxyLayoutPosition`)
 * so a real origin territory places the launch point right where that
 * territory's own solar system already renders. An order with no
 * `originSeasonId` (the sender held no territory of their own when they
 * sent it -- see `GalaxyFleetOrder.originSeasonId`'s comment on the
 * backend) still needs *some* deterministic point to launch from, so this
 * hashes the owner's authUid into the same layout function instead of
 * picking an arbitrary fixed point every fleet would otherwise share.
 */
export const fleetOriginPosition = (originSeasonId: string | undefined, ownerAuthUid: string, radius = 40): Vec3 =>
  galaxyLayoutPosition(originSeasonId ?? `fleet-origin:${ownerAuthUid}`, radius);

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
 * Classifies a public galaxy planet into the five Space-View render states.
 * `isContested` and `isCharted` are injected predicates rather than fields
 * read off the planet: the backend does not expose a contestation/raid
 * signal on the public listing itself (Senate proposals are a separate
 * fetch), and charting is per-viewer state (§17.2's fog of war) rather than
 * anything global. Both default to their pre-fog behavior (never
 * contested, always charted) so existing callers see no change until they
 * opt in by passing a real predicate.
 */
export const classifyPlanetState = (
  planet: PublicGalaxyPlanet,
  mySeasonIds: ReadonlySet<string>,
  isContested: (seasonId: string) => boolean = () => false,
  isCharted: (seasonId: string) => boolean = () => true
): SpacePlanetState => {
  if (mySeasonIds.has(planet.seasonId)) return "owned";
  if (isContested(planet.seasonId)) return "contested";
  if (!isCharted(planet.seasonId)) return "unknown";
  if (planet.tier === "PLANET" && planet.claimed === false) return "frontier";
  return "other";
};

export const toSpacePlanetViewModels = (
  planets: ReadonlyArray<PublicGalaxyPlanet>,
  mySeasonIds: ReadonlySet<string>,
  isContested?: (seasonId: string) => boolean,
  isCharted?: (seasonId: string) => boolean
): SpacePlanetViewModel[] =>
  planets.map((planet) => {
    const state = classifyPlanetState(planet, mySeasonIds, isContested, isCharted);
    // §17.2: Unknown shows "nothing more" than a star -- no name leaks
    // through, even if the public listing happens to carry one.
    return { seasonId: planet.seasonId, tier: planet.tier, label: state === "unknown" ? "Unknown System" : (planet.planetName ?? planet.seasonId), state };
  });

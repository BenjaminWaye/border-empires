// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit — same pattern as worldgen-continents.ts /
// worldgen-mountain-rings.ts. Owns the per-tile "how far above sea level"
// scoring field, plus the calibrated sea/coastal thresholds derived from that
// field so the realized land/water ratio matches a target (Earth is ~29%
// land) instead of being whatever a hand-picked constant produced.
//
// Continents style uses tectonic plates (worldgen-plates.ts): a Voronoi
// assignment of tiles to plates, with elevation driven by how the two
// nearest plates' drift vectors interact at their shared boundary --
// colliding (convergent) plates uplift into mountain ranges that trace the
// boundary itself, separating (divergent) plates form mild rifts. This is
// the Red Blob Games / LeatherBee "plates then noise" approach: tectonics
// decides macro shape and where ranges cluster, the domain-warped noise
// below still decides fine coastline jaggedness on top of it. Islands style
// keeps the older ellipse-seed approach (worldgen-continents.ts) instead --
// lower risk to leave alone, and the "many small islands" look doesn't need
// plate boundaries to read as intentional the way a single continent does.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { buildIslands, type ContinentSeed } from "./worldgen-continents.js";
import { valueNoise, valueNoiseFaceted } from "./worldgen-noise.js";
import { buildPlates, type Plate } from "./worldgen-plates.js";
import { POLAR_BAND, type WorldStyle, worldIndex, worldSeed, worldStyle } from "./worldgen.js";
import { amplitudeFromNearCoastSpread, setCoastNoiseAmplitude, shorelineRoughnessAt } from "./worldgen-coastline-style.js";
import { archipelagoBumpAt, atollBumpAt } from "./worldgen-archipelago-features.js";

const UNSET_I16 = -2;
const TILE_COUNT = WORLD_WIDTH * WORLD_HEIGHT;
const continentIndexCache = new Int16Array(TILE_COUNT);
const continentScoreCache = new Float32Array(TILE_COUNT);
// Convergent boundary stress (isMountainRange's tectonic gate) is a separate
// field from elevation -- a tile can be modestly elevated but sit exactly on
// a strongly convergent boundary, or vice versa -- so it needs its own cache
// rather than being reconstructible from continentScoreCache alone.
const boundaryStressCache = new Float32Array(TILE_COUNT);
const boundaryStressReady = new Uint8Array(TILE_COUNT);

export const resetContinentScoreCaches = (): void => {
  continentIndexCache.fill(UNSET_I16);
  continentScoreCache.fill(Number.NaN);
  boundaryStressReady.fill(0);
};

// worldStyle() (not a locally cached copy) is read fresh on every call so a
// setWorldSeed() style switch is picked up immediately, even if this runs
// before anything else in the module has observed the new style.
let cachedContinentSeed = Number.NaN;
let cachedContinentStyle: WorldStyle = "continents";
let cachedIslandSeeds: ContinentSeed[] = [];
const islandSeeds = (): ContinentSeed[] => {
  const seed = worldSeed();
  if (seed !== cachedContinentSeed || cachedIslandSeeds.length === 0) {
    cachedContinentSeed = seed;
    cachedIslandSeeds = buildIslands();
  }
  return cachedIslandSeeds;
};

const linearDx = (a: number, b: number): number => Math.abs(a - b);
const linearDy = (a: number, b: number): number => Math.abs(a - b);
const toroidalDx = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_WIDTH - d);
};

// Domain warp: distorts the (x, y) sample point through low frequency noise
// fields before it's tested against any plate/continent ellipse. This is
// what turns "ellipse/Voronoi cell with a wobbly edge" into winding, organic
// coastlines and plate boundaries, since the warp displaces whole swaths of
// boundary together rather than perturbing the score per-tile. Two octaves
// (was one): a plate boundary can run 100-200+ tiles between plate centers,
// and a single ~22-tile-amplitude octave doesn't meaningfully bend a line
// that long -- it still reads as a straight, geometric edge. Real plate
// boundaries get their organic curvature from a long, complex history of
// smaller-scale interactions layered on the large-scale trend, which is
// exactly what a second, smaller-cell warp octave approximates here.
const WARP_CELL = 300;
const WARP_AMPLITUDE = Math.max(WORLD_WIDTH, WORLD_HEIGHT) * 0.09;
const WARP_CELL_2 = 110;
const WARP_AMPLITUDE_2 = Math.max(WORLD_WIDTH, WORLD_HEIGHT) * 0.035;
const WARP_SEED_X = 90210;
const WARP_SEED_Y = 190210;
const warpedCoords = (x: number, y: number): { wx: number; wy: number } => {
  const warpDx =
    (valueNoise(x, y, WARP_CELL, worldSeed() + WARP_SEED_X) - 0.5) * 2 * WARP_AMPLITUDE +
    (valueNoise(x, y, WARP_CELL_2, worldSeed() + WARP_SEED_X + 500) - 0.5) * 2 * WARP_AMPLITUDE_2;
  const warpDy =
    (valueNoise(x, y, WARP_CELL, worldSeed() + WARP_SEED_Y) - 0.5) * 2 * WARP_AMPLITUDE +
    (valueNoise(x, y, WARP_CELL_2, worldSeed() + WARP_SEED_Y + 500) - 0.5) * 2 * WARP_AMPLITUDE_2;
  return { wx: x + warpDx, wy: y + warpDy };
};

const computeEllipseContinentScore = (wx: number, wy: number): { index: number; score: number } => {
  let bestIdx = -1;
  let best = 0;
  const cs = islandSeeds();
  for (let i = 0; i < cs.length; i += 1) {
    const c = cs[i]!;
    const dx = linearDx(wx, c.cx);
    const dy = linearDy(wy, c.cy);
    const angle = Math.atan2(wy - c.cy, wx - c.cx);
    // Directional modulation creates the continent's silhouette. The 1-fold
    // and 2-fold terms (taper/bulge) come first and dominate: real continents
    // read as recognizable shapes -- South America's north-wide/south-narrow
    // taper, Italy's boot, Florida's peninsula -- because of ONE asymmetric
    // bulge-and-taper axis, not from rotationally-symmetric ripples. The
    // higher-fold 3/5/7 terms after them only add secondary bays/necks and
    // fine silhouette complexity on top of that base asymmetric shape.
    // Floored so the combined amplitude (up to ~1.4) can never drive this
    // negative, which would flip rx/ry sign into nonsense.
    const directional = Math.max(
      0.15,
      1 +
        Math.sin(angle + c.taperPhase) * 0.5 +
        Math.sin(angle * 2 + c.bulgePhase) * 0.3 +
        Math.sin(angle * 3 + c.lobeA) * 0.22 +
        Math.sin(angle * 5 + c.lobeB) * 0.16 +
        Math.sin(angle * 7 + c.wobble) * 0.1
    );
    const radialNoise = valueNoise(wx + c.cx * 0.7, wy + c.cy * 0.7, 88, c.coastSeed);
    const coastWarp = 1 + (radialNoise - 0.5) * 0.25;
    const rx = c.rx * directional * coastWarp;
    const ry = c.ry * directional * coastWarp;
    const nx = dx / Math.max(1, rx);
    const ny = dy / Math.max(1, ry);
    const base = 1 - Math.sqrt(nx * nx + ny * ny);
    if (base <= 0) continue;
    const score = base * shorelineRoughnessAt(wx, wy, c.cx, c.cy, c.coastSeed);
    if (score > best) {
      best = score;
      bestIdx = i;
    }
  }
  return { index: bestIdx, score: best };
};

// Distorts a tile's distance to ONE plate by noise unique to that plate (its
// own seed offset), not a shared global warp -- this is the actual technique
// LeatherBee's "Terrain Generation 4" describes as "noised faultlines":
// perturbing the fault/boundary itself, not just globally translating the
// sample point before a clean distance calculation. A shared coordinate warp
// (see warpedCoords) moves whole regions together and still leaves the
// underlying Voronoi partition mathematically clean/geometric; distorting
// each plate's own pull independently is what actually breaks the boundary
// into a fractal, organic line instead of a warped-but-still-smooth curve.
const plateDistortionSeed = (plate: Plate): number => Math.floor(plate.cx * 7919 + plate.cy * 104729);
const distortedDistanceTo = (wx: number, wy: number, plate: Plate, rawDist: number): number => {
  const macro = valueNoise(wx, wy, 70, plateDistortionSeed(plate) + 11);
  const factor = 1 + (macro - 0.5) * 1.1;
  return rawDist * Math.max(0.25, factor);
};

// The two nearest plates to (wx, wy), toroidal-aware in x (matches
// buildPlates' toroidal spacing check) but not in y -- the map's poles
// (POLAR_BAND rows) are real edges, not a wraparound seam.
const nearestPlates = (wx: number, wy: number, plates: Plate[]): { near: Plate; nearDist: number; far: Plate; farDist: number } => {
  let nearIdx = 0;
  let nearDist = Infinity;
  let farIdx = 0;
  let farDist = Infinity;
  for (let i = 0; i < plates.length; i += 1) {
    const p = plates[i]!;
    const dx = toroidalDx(wx, p.cx);
    const dy = wy - p.cy;
    const dist = distortedDistanceTo(wx, wy, p, Math.hypot(dx, dy));
    if (dist < nearDist) {
      farDist = nearDist;
      farIdx = nearIdx;
      nearDist = dist;
      nearIdx = i;
    } else if (dist < farDist) {
      farDist = dist;
      farIdx = i;
    }
  }
  return { near: plates[nearIdx]!, nearDist, far: plates[farIdx]!, farDist };
};

// How far into a convergent/divergent boundary's influence zone (wx, wy)
// sits: ~1 right at the boundary (near and far plate equidistant), decaying
// to 0 deep inside a single plate's territory. The Red Blob Games trick for
// deriving boundary proximity from a Voronoi diagram without ever building
// its actual polygon edges. Narrow: at 0.09 this bled uplift/mountains 30-40+
// tiles deep into every plate's territory, chewing huge gray blobs out of
// every landmass instead of a clean range tracing the boundary.
const BOUNDARY_BLEND_WIDTH = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.02;
const boundaryStrengthOf = (nearDist: number, farDist: number): number =>
  Math.max(0, 1 - (farDist - nearDist) / BOUNDARY_BLEND_WIDTH);

// Positive = convergent (plates closing the gap between their centers along
// the line joining them -- colliding), negative = divergent (separating).
const convergentStressOf = (near: Plate, far: Plate): number => {
  const dx = toroidalDx(far.cx, near.cx) * (far.cx >= near.cx ? 1 : -1);
  const dy = far.cy - near.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const nearVx = Math.cos(near.driftAngle) * near.driftSpeed;
  const nearVy = Math.sin(near.driftAngle) * near.driftSpeed;
  const farVx = Math.cos(far.driftAngle) * far.driftSpeed;
  const farVy = Math.sin(far.driftAngle) * far.driftSpeed;
  const relVx = nearVx - farVx;
  const relVy = nearVy - farVy;
  return -(relVx * nx + relVy * ny);
};

// How much a given (nearPlate type, farPlate type, stress sign) combination
// raises or lowers elevation at the boundary. Continental-continental
// collisions produce the tallest ranges (real orogeny, e.g. the Himalayas);
// continental-oceanic collisions uplift the continental side into a coastal
// range (Andes-style) while deepening a trench on the oceanic side;
// oceanic-oceanic collisions form milder island-arc uplift. Divergent
// boundaries only get a subtle depression -- rift valleys/mid-ocean ridges
// are real but not the focus here, so they shouldn't just read as more
// ordinary coastline.
// Oceanic-oceanic convergence returns 0, not a mild positive island-arc
// bump: with the narrow boundary blend width needed to keep mountain ranges
// thin (see BOUNDARY_BLEND_WIDTH), even a small uplift there was enough to
// push a THIN THREAD of open ocean above the land threshold exactly along
// the boundary -- since Voronoi boundaries meet in a branching graph, this
// showed up as bizarre root/lightning-bolt-shaped slivers of land isolated
// in open water, connected to no real continent. Real volcanic island arcs
// exist, but aren't worth the risk of reintroducing that artifact here.
const upliftMultiplierFor = (nearContinental: boolean, farContinental: boolean, stress: number): number => {
  if (stress >= 0) {
    if (nearContinental && farContinental) return 1.5;
    if (nearContinental) return 0.9;
    if (farContinental) return -0.6;
    return 0;
  }
  return nearContinental && farContinental ? -0.3 : -0.15;
};
const UPLIFT_SCALE = 0.9;

// Computes elevation score AND raw convergent boundary stress together from
// a single nearestPlates lookup -- these used to be two separate functions
// that each ran their own (expensive, now-distorted-per-plate) nearestPlates
// search for the same tile, doubling the cost of a full-map generation for
// no reason since isMountainRange always queries both for the same tile.
const computePlateContinentScore = (wx: number, wy: number): { index: number; score: number; stress: number } => {
  const plates = buildPlates();
  const { near, nearDist, far, farDist } = nearestPlates(wx, wy, plates);
  const boundaryStrength = boundaryStrengthOf(nearDist, farDist);
  const stress = convergentStressOf(near, far);
  const elevation =
    near.baseElevation +
    boundaryStrength * stress * upliftMultiplierFor(near.isContinental, far.isContinental, stress) * UPLIFT_SCALE +
    // Deliberate open-ocean features (Indonesia-style island chains, ring-
    // shaped atolls) that don't fall out of plate elevation on its own --
    // see worldgen-archipelago-features.ts. Additive here (before the
    // roughness multiplier below) so both still get the same coastline
    // jaggedness as everything else instead of needing bespoke shape logic.
    archipelagoBumpAt(wx, wy) +
    atollBumpAt(wx, wy);
  const roughness = shorelineRoughnessAt(wx, wy, near.cx, near.cy, Math.floor(near.cx * 7919 + near.cy * 104729));
  const index = plates.indexOf(near);
  const rawStress = stress > 0 ? boundaryStrength * stress : 0;
  return { index, score: elevation * roughness, stress: rawStress };
};

const computeContinentScore = (x: number, y: number): { index: number; score: number; stress: number } => {
  const { wx, wy } = warpedCoords(x, y);
  if (worldStyle() === "islands") return { ...computeEllipseContinentScore(wx, wy), stress: 0 };
  return computePlateContinentScore(wx, wy);
};

export const boundaryConvergentStressCachedAt = (x: number, y: number): number => {
  const idx = worldIndex(x, y);
  if (boundaryStressReady[idx] === 1) return boundaryStressCache[idx]!;
  // Sharing continentScore's cache-fill path guarantees this and
  // continentField never redo the same nearestPlates search independently.
  continentScore(x, y);
  return boundaryStressCache[idx]!;
};

const continentScore = (x: number, y: number): { index: number; score: number } => {
  const idx = worldIndex(x, y);
  const cachedScore = continentScoreCache[idx] ?? Number.NaN;
  if (!Number.isNaN(cachedScore)) {
    const cachedIndex = continentIndexCache[idx] ?? UNSET_I16;
    return { index: cachedIndex === UNSET_I16 ? -1 : cachedIndex, score: cachedScore };
  }
  const computed = computeContinentScore(x, y);
  continentScoreCache[idx] = computed.score;
  continentIndexCache[idx] = computed.index;
  boundaryStressCache[idx] = computed.stress;
  boundaryStressReady[idx] = 1;
  return computed;
};

export const continentField = (x: number, y: number): number => continentScore(x, y).score;

export type LandWaterThresholds = { seaThreshold: number; coastalThreshold: number; scoreCeiling: number };

// Target land fraction each style should realize, sampled from the actual
// score distribution rather than guessed from a fixed cutoff. Continents
// style was originally tuned to Earth's real ~29% land / 71% water split,
// but that reads as too much open water for a strategy map -- most 4X games
// (Civilization's default included) target more like 35-40% land, since
// players need somewhere to actually build on, not photographic realism.
// Raised to 0.45 (was 0.37) since even 37% still read as too much open
// water on the 640x320 widescreen aspect ratio -- see PR discussion.
// Islands style keeps a lower target since it's meant to read as mostly
// ocean dotted with land, not a second continents map.
const TARGET_LAND_FRACTION: Record<WorldStyle, number> = {
  continents: 0.45,
  islands: 0.12,
};
// Coastal band sits this far above the sea cutoff, matching the ratio the
// previous hand-tuned constants used (continents: 0.07/0.04, islands: 0.028/0.012).
const COASTAL_THRESHOLD_RATIO = 1.75;
const CALIBRATION_SAMPLE_STEP = 8;

const calibrateThresholds = (style: WorldStyle): LandWaterThresholds => {
  setCoastNoiseAmplitude(1.0); // neutral baseline while sampling, see worldgen-coastline-style.ts
  const scores: number[] = [];
  let maxScore = -Infinity;
  for (let y = POLAR_BAND; y < WORLD_HEIGHT - POLAR_BAND; y += CALIBRATION_SAMPLE_STEP) {
    for (let x = 0; x < WORLD_WIDTH; x += CALIBRATION_SAMPLE_STEP) {
      const score = computeContinentScore(x, y).score;
      scores.push(score);
      if (score > maxScore) maxScore = score;
    }
  }
  scores.sort((a, b) => a - b);
  const targetFraction = TARGET_LAND_FRACTION[style];
  // A tile only counts as LAND (baseTerrainCodeAt) once its score clears
  // coastalThreshold, not seaThreshold -- scores between the two still read
  // as SEA. So it's coastalThreshold that must sit at the target-land
  // percentile; seaThreshold is derived below it by the same ratio the old
  // hand-tuned constants used.
  const cutoffIdx = Math.min(scores.length - 1, Math.max(0, Math.floor(scores.length * (1 - targetFraction))));
  const coastalThreshold = scores[cutoffIdx] ?? 0.07;
  setCoastNoiseAmplitude(amplitudeFromNearCoastSpread(scores, cutoffIdx, coastalThreshold));
  return {
    seaThreshold: coastalThreshold / COASTAL_THRESHOLD_RATIO,
    coastalThreshold,
    // Sampled rather than a fixed constant: the ellipse field's ceiling was
    // always close to 1.0, but the tectonic elevation field's achievable max
    // depends on the uplift constants above and isn't a known fixed number --
    // getInlandThresholds' headroom calculation needs the real ceiling or an
    // assumed one that's too low makes every inland gate unreachable again
    // (the exact failure mode a fixed SCORE_CEILING caused earlier).
    scoreCeiling: Math.max(maxScore, coastalThreshold + 0.01),
  };
};

let cachedThresholdSeed = Number.NaN;
let cachedThresholdStyle: WorldStyle | undefined;
let cachedThresholds: LandWaterThresholds | undefined;

// Always reads worldStyle() live (see continents() above) rather than taking
// a style argument, so callers can't accidentally pass a stale style.
export const getLandWaterThresholds = (): LandWaterThresholds => {
  const seed = worldSeed();
  const style = worldStyle();
  if (seed !== cachedThresholdSeed || style !== cachedThresholdStyle || !cachedThresholds) {
    cachedThresholdSeed = seed;
    cachedThresholdStyle = style;
    cachedThresholds = calibrateThresholds(style);
  }
  return cachedThresholds;
};

export const continentIdAt = (x: number, y: number): number | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const out = continentScore(wx, wy);
  if (out.index < 0 || out.score < getInlandThresholds().continentIdentity) return undefined;
  return out.index;
};

export type InlandThresholds = {
  continentIdentity: number;
  lakeCandidateInland: number;
  mountainRangeInland: number;
};

// The old system used fixed absolute cutoffs (0.09/0.1/0.11/0.22) on a score
// field with roughly a 0.07 coastalThreshold and ~1.0 ceiling. A multiple-of-
// coastal ratio breaks once calibration or the scoring algorithm changes that
// range (this is what produced zero lakes/oases/mountains above the gate in
// earlier testing). Instead these are expressed as how far *into the
// remaining headroom* between coastalThreshold and the (now sampled, not
// assumed) ceiling each old cutoff sat, which stays reachable regardless of
// where calibration puts coastalThreshold or what the scoring algorithm's
// achievable range actually is.
const OLD_SCORE_CEILING = 1.0;
const OLD_COASTAL_THRESHOLD = 0.07;
const headroomFraction = (oldAbsolute: number): number =>
  (oldAbsolute - OLD_COASTAL_THRESHOLD) / (OLD_SCORE_CEILING - OLD_COASTAL_THRESHOLD);
const INLAND_HEADROOM_FRACTION = {
  continentIdentity: headroomFraction(0.09),
  // Lower than the old 0.22 raw value: a lake's shape checks require several
  // points up to ~23 tiles from center to also clear this bar (see
  // worldgen-lakes.ts), and the more fragmented coastlines from domain
  // warping make that much harder to satisfy at the old, stricter bar.
  lakeCandidateInland: headroomFraction(0.15),
  mountainRangeInland: headroomFraction(0.1),
};

let cachedInlandSeed = Number.NaN;
let cachedInlandStyle: WorldStyle | undefined;
let cachedInland: InlandThresholds | undefined;

export const getInlandThresholds = (): InlandThresholds => {
  const seed = worldSeed();
  const style = worldStyle();
  if (seed !== cachedInlandSeed || style !== cachedInlandStyle || !cachedInland) {
    cachedInlandSeed = seed;
    cachedInlandStyle = style;
    const { coastalThreshold, scoreCeiling } = getLandWaterThresholds();
    const headroom = scoreCeiling - coastalThreshold;
    cachedInland = {
      continentIdentity: coastalThreshold + INLAND_HEADROOM_FRACTION.continentIdentity * headroom,
      lakeCandidateInland: coastalThreshold + INLAND_HEADROOM_FRACTION.lakeCandidateInland * headroom,
      mountainRangeInland: coastalThreshold + INLAND_HEADROOM_FRACTION.mountainRangeInland * headroom,
    };
  }
  return cachedInland;
};

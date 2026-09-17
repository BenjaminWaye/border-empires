// Split out of worldgen-continent-score.ts (over the repo's 500-line file
// cap after the widescreen aspect-ratio change) -- owns the coastline
// "roughness" noise layer: how jagged/varied the coastline reads, and in
// what style, independent of the underlying plate/ellipse elevation field
// that worldgen-continent-score.ts computes. computeEllipseContinentScore and
// computePlateContinentScore both multiply their raw elevation by
// shorelineRoughnessAt's result; calibrateThresholds (also in
// worldgen-continent-score.ts) calls setCoastNoiseAmplitude once per (seed,
// style) after sampling the actual score distribution.
import { valueNoise, valueNoiseFaceted } from "./worldgen-noise.js";
import { worldSeed } from "./worldgen.js";

// Calibrated once per (seed, style) by calibrateThresholds in
// worldgen-continent-score.ts, off the actual score distribution near the
// coastline -- see the Dragons Abound "Voronoi Revisited" technique
// referenced there. Starts at a neutral 1.0 so the calibration sampling pass
// itself (which calls computeContinentScore, which calls
// shorelineRoughnessAt) isn't circular.
let coastNoiseAmplitude = 1.0;
export const setCoastNoiseAmplitude = (amplitude: number): void => {
  coastNoiseAmplitude = amplitude;
};

// Coastline noise amplitude, calibrated (not guessed) from how much the
// score actually varies among tiles near the coastline -- see the Dragons
// Abound "Voronoi Revisited Part 2" technique: find the range of scores in a
// band of samples close to the land cutoff, and size the noise perturbation
// off that range so it reliably and meaningfully moves the coastline instead
// of being either imperceptible or overpowering. Clamped to a sane range
// since a pathological seed's near-cutoff band could be almost flat (a huge
// amplitude to compensate) or already very spread out (near zero needed).
const NEAR_COAST_BAND_FRACTION = 0.05;
export const amplitudeFromNearCoastSpread = (
  sortedScores: number[],
  cutoffIdx: number,
  coastalThreshold: number
): number => {
  const bandHalf = Math.max(1, Math.floor(sortedScores.length * NEAR_COAST_BAND_FRACTION));
  const lo = sortedScores[Math.max(0, cutoffIdx - bandHalf)] ?? coastalThreshold;
  const hi = sortedScores[Math.min(sortedScores.length - 1, cutoffIdx + bandHalf)] ?? coastalThreshold;
  const nearCoastSpread = Math.max(0, hi - lo);
  // The unmodulated roughness blend swings about +/-0.42 around 1.0 at the
  // coastalThreshold's own magnitude -- solve for the amplitude that would
  // make that swing roughly match the observed near-coast spread.
  const raw = coastalThreshold > 0 ? nearCoastSpread / (coastalThreshold * 0.42) : 1;
  return Math.min(2.5, Math.max(0.5, raw));
};

// Coastline "style" zones: a low-frequency field (not offset per-
// plate/continent, unlike the noise below) that partitions the whole map
// into irregular blobby regions, each independently assigned one of three
// distinct coastline styles (see FeatureKind below) via a second, offset
// sample of the same noise. Earlier versions of this either applied one
// uniform ripple everywhere (reads as static) or a single "dramatic" style
// in rare pockets with a near-zero-amplitude "calm" floor everywhere else
// (large stretches read as flat/boring). Real coastlines are never flat --
// even a "calm" stretch has real headlands and bays -- they just vary in
// *character* from place to place (a fjord coast, an archipelago, a chain of
// broad sweeping bays). So every location now gets a solid, never-near-zero
// complexity level (COMPLEXITY_FLOOR..COMPLEXITY_CEILING, its own smoothly
// varying field) plus a zone-assigned style that changes which octaves of
// shorelineRoughnessAt's blend dominate.
const FEATURE_ZONE_CELL = 150;
export type FeatureKind = "fjord" | "archipelago" | "bay";
// Weighted toward "bay" (calm, chunky, broad-headland coastlines) rather than
// an even three-way split -- reference real-world/hex-strategy maps read as
// mostly solid, meaty continents with a handful of distinctive bays/
// peninsulas, not spindly fjords and scattered archipelagos everywhere.
// fjord/archipelago are still common enough to give real variety, just not
// the dominant character of most coastline.
const featureKindAt = (wx: number, wy: number): FeatureKind => {
  const kindNoise = valueNoise(wx, wy, FEATURE_ZONE_CELL, worldSeed() + 707070);
  if (kindNoise < 0.28) return "fjord";
  if (kindNoise < 0.48) return "archipelago";
  return "bay";
};
const COMPLEXITY_FLOOR = 0.7;
const COMPLEXITY_CEILING = 1.6;
const regionalComplexityAt = (wx: number, wy: number): number =>
  COMPLEXITY_FLOOR + valueNoise(wx, wy, FEATURE_ZONE_CELL, worldSeed() + 606060) * (COMPLEXITY_CEILING - COMPLEXITY_FLOOR);

// Same 4-octave roughness blend used by both the plate and ellipse paths:
// macro/micro use the smooth valueNoise (large-scale shape should still look
// like a plausible landmass), but fine/finer use valueNoiseFaceted --
// smoothstep interpolation can only ever produce curves, and a real
// coastline is jagged/angular down to small scales, never smoothly rounded.
//
// The four octave weights below fall off roughly by half each time
// (persistence ~0.5), matching real fractal (1/f) terrain noise -- this is
// the actual mechanism behind why natural coastlines read as mostly smooth
// curves with occasional dramatic features (a fjord, a peninsula), rather
// than uniform "static": the low-frequency macro octave dominates and does
// almost all of the real shaping, while the high-frequency fine/finer octaves
// only add subtle surface texture on top instead of competing with it at
// near-equal strength. An earlier version weighted all four octaves almost
// equally (0.3/0.18/0.2/0.16), which is what actually produces the
// salt-and-pepper/staircase look real coastlines don't have -- flat-weighted
// octaves approximate white noise, not fractal terrain.
//
// The blend's overall strength is scaled by the calibrated amplitude (so it's
// sized to the actual score range near the coastline, not a guessed
// constant) and by the regional complexity field (so it isn't uniform).
// Domain warp (height(x,y) = noise(x,y,noise(x,y)), the standard technique
// for breaking up the geometric regularity of raw noise -- see e.g.
// https://www.researchgate.net/figure/The-effect-of-domain-warping-is-illustrated_fig3_228909493)
// applied specifically to the coastline roughness sample point, distinct
// from the plate-boundary warp in worldgen-continent-score.ts's
// warpedCoords. Without this, each roughness "bump" is a simple radial lobe
// centered on a noise-grid cell; warping the sample coordinates first lets
// bumps stretch, curve, and merge into organically shaped inlets/spits
// instead of a regular bump pattern.
const ROUGHNESS_WARP_CELL = 90;
const ROUGHNESS_WARP_AMPLITUDE = 60;
const warpedRoughnessCoords = (wx: number, wy: number, coastSeed: number): { rx: number; ry: number } => ({
  rx: wx + (valueNoise(wx, wy, ROUGHNESS_WARP_CELL, coastSeed + 811) - 0.5) * 2 * ROUGHNESS_WARP_AMPLITUDE,
  ry: wy + (valueNoise(wx, wy, ROUGHNESS_WARP_CELL, coastSeed + 823) - 0.5) * 2 * ROUGHNESS_WARP_AMPLITUDE,
});

// Six octaves spanning a wide range of scales (280 down to 7 tiles) with a
// consistent ~0.55 persistence (gain) per octave -- true fBm self-similarity,
// so detail keeps appearing at every scale the way a real coastline's does
// (a bay contains smaller inlets, which contain smaller notches) instead of
// stopping at one "fine" scale. Coarser three octaves use smooth valueNoise
// (large-scale shape should still look like a plausible landmass); finer
// three use valueNoiseFaceted, since smoothstep interpolation can only ever
// produce curves and a real coastline is jagged/angular down to small
// scales, never smoothly rounded.
//
// Each FeatureKind reweights the same six octaves toward a different part of
// the spectrum instead of introducing bespoke per-style geometry -- cheap to
// compute (still one blend, no branching logic beyond picking weights) while
// giving each style a genuinely different silhouette:
//  - fjord: mid-scale octaves (n2/n3) dominate, giving deep, narrow, often
//    branching inlets that cut well inland rather than just nibbling the edge.
//  - archipelago: the two finest octaves dominate almost exclusively, which
//    (combined with a high overall complexity) pushes many small, separate
//    high-frequency lobes above and below the coastal threshold -- reading as
//    a scatter of small islands and inlets rather than one continuous edge.
//  - bay: only the coarsest octaves contribute -- broad, sweeping headlands
//    and bays with a large radius, the calmest-*reading* style without ever
//    dropping to a near-zero, flat-looking amplitude.
const FEATURE_WEIGHTS: Record<FeatureKind, readonly [number, number, number, number, number, number]> = {
  fjord: [0.28, 0.34, 0.24, 0.09, 0.035, 0.015],
  // Shifted weight from the two finest octaves (n5/n6) toward the
  // mid octaves (n2/n3) versus an earlier version -- maximal fine-scale
  // weighting produced a scatter of near-single-tile specks; islands read
  // better as a chunkier, more countable archipelago with mid-scale weight
  // dominant instead.
  archipelago: [0.12, 0.2, 0.22, 0.18, 0.14, 0.14],
  bay: [0.46, 0.3, 0.16, 0.05, 0.02, 0.01],
};
export const shorelineRoughnessAt = (wx: number, wy: number, ox: number, oy: number, coastSeed: number): number => {
  const { rx, ry } = warpedRoughnessCoords(wx + ox, wy + oy, coastSeed);
  const n1 = valueNoise(rx, ry, 280, coastSeed + 17);
  const n2 = valueNoise(rx, ry, 130, coastSeed + 23);
  const n3 = valueNoise(rx, ry, 60, coastSeed + 29);
  const n4 = valueNoiseFaceted(rx, ry, 28, coastSeed + 31);
  const n5 = valueNoiseFaceted(rx, ry, 14, coastSeed + 37);
  const n6 = valueNoiseFaceted(rx, ry, 7, coastSeed + 41);
  const [w1, w2, w3, w4, w5, w6] = FEATURE_WEIGHTS[featureKindAt(wx, wy)];
  const blend =
    (n1 - 0.5) * w1 + (n2 - 0.5) * w2 + (n3 - 0.5) * w3 + (n4 - 0.5) * w4 + (n5 - 0.5) * w5 + (n6 - 0.5) * w6;
  return 1 + blend * coastNoiseAmplitude * regionalComplexityAt(wx, wy);
};

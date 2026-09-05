// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit.
//
// v1/v2: landBiomeAt's sandField and grassShadeAt's forestField were both
// blends of large-cell (26-84 tile) bilinear valueNoise octaves. Averaging
// large-cell octaves pulls the result toward the middle of [0, 1) (each
// octave is itself an interpolation between random corners, and a weighted
// sum of several such interpolations rarely lands near either extreme), and
// large cells mean the field barely changes tile-to-tile -- so v1's
// thresholds (picked as if the field spanned evenly to the extremes) almost
// never triggered SAND/DARK, and even v2's recalibrated thresholds still
// produced patches tens of tiles wide, because the *field* itself changed
// slowly, not just because the thresholds were wrong.
//
// v3 fixes the actual cause: sandField/forestField/hillField now blend a
// small-cell "mottle" octave into the existing large-cell "climate" octave
// (see mottledField below) so a region still reads as a recognizable place
// (a desert you could point at) with real edge/interior texture, rather
// than either drifting slowly for dozens of tiles (the original bug) or --
// an earlier version of this fix that weighted the mottle octave too
// heavily -- dissolving into static with no readable region shape at all.
// climateWeight 0.3 is the tuned middle ground: scanline runs average
// meaningfully shorter than legacy (v2) while region shares stay sane (see
// worldgen-terrain-variation.test.ts). Thresholds below are calibrated
// against this field's distribution (measured via a scanline run-length +
// share harness against a fixed seed).
//
// v1 and v2 are kept byte-for-byte so already-running seasons aren't
// retroactively reterrained (see worldgen-version.ts).
import type { RegionType } from "../types.js";
import { valueNoise } from "./worldgen-noise.js";

// Blends a low-weight large-cell "climate" octave with a high-weight
// small-cell "mottle" octave. The mottle octave is what makes v3's fields
// flip on a per-few-tiles basis instead of drifting slowly across dozens of
// tiles; the climate octave keeps the overall region reading as more/less
// arid or forested rather than pure static.
const mottledField = (climate: number, mottle: number, climateWeight: number): number =>
  climate * climateWeight + mottle * (1 - climateWeight);

// climateWeight was originally 0.15-0.2 (85%+ on a 2-3 tile mottle octave),
// which broke up giant blobs but overshot badly -- it also erased any
// readable region shape, so a "desert" was just scattered sand static over
// grass rather than a recognizable arid patch. Raised so the large-cell
// climate octave dominates (a real region you can look at and call
// "desert"/"forest"), with the mottle octave now only roughing up its edges
// and sprinkling modest texture inside, not deciding the tile outright.
export const sandFieldAt = (wx: number, wy: number, seed: number, version: number): number =>
  version < 3
    ? valueNoise(wx, wy, 72, seed + 303) * 0.7 + valueNoise(wx - 41, wy + 29, 26, seed + 317) * 0.3
    : mottledField(valueNoise(wx, wy, 60, seed + 303), valueNoise(wx - 41, wy + 29, 4, seed + 317), 0.3);

export const forestFieldAt = (wx: number, wy: number, seed: number, version: number): number =>
  version < 3
    ? valueNoise(wx + 41, wy - 23, 84, seed + 99) * 0.5 +
      valueNoise(wx - 17, wy + 61, 26, seed + 109) * 0.3 +
      valueNoise(wx + 73, wy - 91, 11, seed + 131) * 0.2
    : mottledField(valueNoise(wx + 41, wy - 23, 60, seed + 99), valueNoise(wx - 17, wy + 61, 4, seed + 109), 0.3);

export const hillFieldAt = (wx: number, wy: number, seed: number, version: number): number =>
  version < 3
    ? valueNoise(wx + 211, wy - 97, 96, seed + 811) * 0.65 + valueNoise(wx - 53, wy + 137, 34, seed + 821) * 0.35
    : mottledField(valueNoise(wx + 211, wy - 97, 60, seed + 811), valueNoise(wx - 53, wy + 137, 4, seed + 821), 0.3);

export const sandThresholdFor = (region: RegionType | undefined, version: number): number => {
  if (version < 2) {
    return region === "CRYSTAL_WASTES"
      ? 0.52
      : region === "BROKEN_HIGHLANDS"
        ? 0.58
        : region === "ANCIENT_HEARTLAND"
          ? 0.72
          : 0.78;
  }
  if (version === 2) {
    return region === "CRYSTAL_WASTES"
      ? 0.38
      : region === "BROKEN_HIGHLANDS"
        ? 0.48
        : region === "ANCIENT_HEARTLAND"
          ? 0.58
          : 0.68;
  }
  return region === "CRYSTAL_WASTES"
    ? 0.55
    : region === "BROKEN_HIGHLANDS"
      ? 0.62
      : region === "ANCIENT_HEARTLAND"
        ? 0.68
        : 0.74;
};

export const forestDarkThresholdFor = (region: RegionType | undefined, version: number): number => {
  if (version < 2) {
    return region === "DEEP_FOREST"
      ? 0.36
      : region === "BROKEN_HIGHLANDS"
        ? 0.24
        : region === "ANCIENT_HEARTLAND"
          ? 0.2
          : 0.16;
  }
  if (version === 2) {
    return region === "DEEP_FOREST"
      ? 0.55
      : region === "BROKEN_HIGHLANDS"
        ? 0.4
        : region === "ANCIENT_HEARTLAND"
          ? 0.32
          : 0.24;
  }
  return region === "DEEP_FOREST"
    ? 0.52
    : region === "BROKEN_HIGHLANDS"
      ? 0.42
      : region === "ANCIENT_HEARTLAND"
        ? 0.34
        : 0.26;
};

export const hillThresholdFor = (isBrokenHighlands: boolean, version: number): number => {
  if (version < 3) return isBrokenHighlands ? 0.42 : 0.86;
  return isBrokenHighlands ? 0.58 : 0.85;
};

// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit.
//
// landBiomeAt's sandField and grassShadeAt's forestField are both blends of
// several bilinear valueNoise octaves. Averaging octaves like that pulls the
// result toward the middle of the [0, 1) range (each octave is itself an
// interpolation between random corners, and a weighted sum of several such
// interpolations rarely lands near either extreme) — in practice the field
// almost never climbs past ~0.75 or drops below ~0.15. The original (v1)
// thresholds below were picked as if the field were uniformly distributed
// across the full range, so SAND and forest-DARK basically never won,
// leaving the map looking like one large GRASS/LIGHT patch regardless of
// region. v2 recalibrates both threshold sets against the field's actual
// centered distribution so region variety introduced by #1782 (see
// regionTypeAt in worldgen.ts) shows up as visible biome variety instead of
// just smaller-shaped, still-uniformly-green regions. v1 is kept byte-for-
// byte so already-running seasons aren't retroactively reterrained (see
// worldgen-version.ts).
import type { RegionType } from "../types.js";

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
  return region === "CRYSTAL_WASTES"
    ? 0.38
    : region === "BROKEN_HIGHLANDS"
      ? 0.48
      : region === "ANCIENT_HEARTLAND"
        ? 0.58
        : 0.68;
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
  return region === "DEEP_FOREST"
    ? 0.55
    : region === "BROKEN_HIGHLANDS"
      ? 0.4
      : region === "ANCIENT_HEARTLAND"
        ? 0.32
        : 0.24;
};

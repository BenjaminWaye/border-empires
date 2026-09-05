// Purely cosmetic subdivision of grassShadeAt's LIGHT bucket into LIGHT and
// LIGHTER, for client rendering variety (a genuinely lighter green alongside
// the existing light/dark split, not just the two close olive tones). This
// intentionally does NOT change grassShadeAt's own return value or caching --
// FARM/UMBRITE resource placement (server-worldgen-terrain.ts) and every
// other gameplay consumer keeps keying off the original LIGHT/DARK shade,
// unaffected by this file. Gated behind worldgenVersion 6 so already-running
// seasons render exactly as before.
import { grassShadeAt, worldSeed } from "./worldgen.js";
import { worldgenVersion } from "./worldgen-version.js";
import { valueNoise } from "./worldgen-noise.js";

export type GrassTone = "LIGHT" | "LIGHTER" | "DARK";

export const grassToneAt = (x: number, y: number): GrassTone | undefined => {
  const shade = grassShadeAt(x, y);
  if (shade === undefined || shade === "DARK") return shade;
  if (worldgenVersion() < 6) return shade;
  const tone = valueNoise(x + 311, y - 197, 5, worldSeed() + 941);
  return tone > 0.55 ? "LIGHTER" : "LIGHT";
};

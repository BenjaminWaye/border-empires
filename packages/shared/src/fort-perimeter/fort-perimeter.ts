import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { FORT_TIER_LADDER, defendingFortVariant } from "../structure-costs/structure-costs.js";
import type { FortVariant } from "../types.js";

/**
 * Fort perimeter: a standing fortification also shields the owner's own
 * garrisoned (SETTLED) tiles around it with a share of its own defense bonus.
 * Palisade and Fort cover radius 1 (the 8 neighbours) with a third of their
 * bonus; Titanium and Thunder Bastion cover radius 2 with a quarter of it.
 * "Bonus" is the part above 1x, so a Fort (2.5x) gives its ring
 * 1 + 1.5 / 3 = 1.5x. Perimeters never stack: a tile takes the strongest one
 * covering it, and a tile with its own fort keeps whichever is stronger.
 */
export type FortPerimeterSpec = { radius: number; bonusShare: number };

export const FORT_PERIMETER_BY_VARIANT: Record<FortVariant, FortPerimeterSpec> = {
  PALISADE: { radius: 1, bonusShare: 1 / 3 },
  FORT: { radius: 1, bonusShare: 1 / 3 },
  TITANIUM_BASTION: { radius: 2, bonusShare: 1 / 4 },
  THUNDER_BASTION: { radius: 2, bonusShare: 1 / 4 }
};

export const FORT_PERIMETER_MAX_RADIUS = 2;

/** Defense multiplier a perimeter of `variant` gives the tiles it covers. `techMult` is the defender's fortDefenseMult. */
export const fortPerimeterDefenseMult = (variant: FortVariant, techMult = 1): number =>
  1 + (FORT_TIER_LADDER[variant].defenseMult * techMult - 1) * FORT_PERIMETER_BY_VARIANT[variant].bonusShare;

/** Minimal tile facts the scan needs; sim, gateway and client project into this. */
export type FortPerimeterTileFacts = {
  ownerId?: string | undefined;
  fort?:
    | {
        ownerId?: string | undefined;
        status?: string | undefined;
        variant?: FortVariant | undefined;
        upgradingFrom?: FortVariant | undefined;
        disabledUntil?: number | undefined;
      }
    | null
    | undefined;
};

/**
 * The fort tier projecting a perimeter onto a fortified tile at (x, y), or
 * undefined. `ownerId` must own both the fort and the fort's tile.
 * `isFortUsable` lets the caller drop forts it knows are dormant or held
 * (capture hold); the fort tile at (x, y) itself is skipped -- its own fort
 * is a separate combat term.
 */
export const fortPerimeterSourceVariant = (
  ownerId: string,
  x: number,
  y: number,
  getTile: (x: number, y: number) => FortPerimeterTileFacts | undefined,
  nowMs: number,
  isFortUsable?: (x: number, y: number, tile: FortPerimeterTileFacts) => boolean
): FortVariant | undefined => {
  let best: FortVariant | undefined;
  let bestMult = 1;
  const r = FORT_PERIMETER_MAX_RADIUS;
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const wx = (((x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      const wy = (((y + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
      const tile = getTile(wx, wy);
      const fort = tile?.fort;
      if (!tile || !fort || tile.ownerId !== ownerId || fort.ownerId !== ownerId) continue;
      if ((fort.disabledUntil ?? 0) > nowMs) continue;
      const variant = defendingFortVariant(fort);
      if (!variant) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > FORT_PERIMETER_BY_VARIANT[variant].radius) continue;
      const mult = fortPerimeterDefenseMult(variant);
      if (mult <= bestMult) continue;
      if (isFortUsable && !isFortUsable(wx, wy, tile)) continue;
      best = variant;
      bestMult = mult;
    }
  }
  return best;
};

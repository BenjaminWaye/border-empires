// Garrison Many and region House Charges (playtest 2026-11-27: "Garrison 75% of Thramvault Waste" gave no
// hint which tiles count). While Garrison Many is open with no charge focused, the map shades every kept
// region charge's area, exactly as "Show on map" does for one charge (houseChargeTintTiles, drawn by the 2D
// and true-3D guide overlays), and the Garrison Many sheet counts the selected tiles inside one.
import type { HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

type RegionChargeState = Pick<ClientState, "houseCharges">;

/** Kept charges scored on garrisoning an area (Survey, desert, tundra): the ones a garrison can count toward. */
export const keptRegionCharges = (state: RegionChargeState): HouseChargeView[] =>
  state.houseCharges?.charges.filter((charge) => charge.kept && (charge.areaTileKeys?.length ?? 0) > 0) ?? [];

let cachedFor: RegionChargeState["houseCharges"] | undefined;
let cachedKeys: ReadonlySet<string> = new Set();

/** Tile keys inside any kept region charge's area. Recomputed only when the charges payload changes. */
export const regionChargeTileKeys = (state: RegionChargeState): ReadonlySet<string> => {
  if (state.houseCharges !== cachedFor) {
    cachedFor = state.houseCharges;
    cachedKeys = new Set(keptRegionCharges(state).flatMap((charge) => charge.areaTileKeys ?? []));
  }
  return cachedKeys;
};

/** How many of `keys` (a Garrison Many selection) lie inside a kept region charge's area. */
export const selectedTilesInRegionCharges = (state: RegionChargeState, keys: readonly string[]): number => {
  const area = regionChargeTileKeys(state);
  return area.size === 0 ? 0 : keys.filter((key) => area.has(key)).length;
};

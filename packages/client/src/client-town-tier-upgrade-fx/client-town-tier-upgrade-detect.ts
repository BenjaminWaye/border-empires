import { recordTileRevisionChange } from "../client-tile-merge/client-tile-merge.js";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";
import {
  recordTownTierUpgrade,
  TOWN_GROWTH_DUST_MS,
  townTierUpgradeFeedMessage,
  townTierUpgradeStep,
  type TownTierUpgradeFxState
} from "./client-town-tier-upgrade-fx.js";

type PreviousTownSnapshot = { ownerId?: string; town?: Tile["town"]; townPopulationTier?: Tile["townPopulationTier"] };

/**
 * Scans a merged TILE_DELTA_BATCH for the local player's towns that stepped
 * up a population tier, starts each one's growth transition (3D + 2D) and
 * announces it in the feed. Tile snapshots must be taken before the merge.
 */
export const emitTownTierUpgrades = (input: {
  state: TownTierUpgradeFxState & { me: string; tiles: Map<string, Tile> };
  tileUpdates: ReadonlyArray<{ x: number; y: number }>;
  previousTileByKey: ReadonlyMap<string, PreviousTownSnapshot | undefined>;
  keyFor: (x: number, y: number) => string;
  nowMs: number;
  pushFeed: (msg: string, type?: string, severity?: string) => void;
}): void => {
  const { state, keyFor } = input;
  for (const update of input.tileUpdates) {
    const key = keyFor(update.x, update.y);
    const resolved = state.tiles.get(key);
    const step = townTierUpgradeStep(input.previousTileByKey.get(key), resolved, state.me);
    if (!step || !resolved) continue;
    recordTownTierUpgrade(state, key, { x: update.x, y: update.y, ...step, startedAt: input.nowMs });
    input.pushFeed(townTierUpgradeFeedMessage(resolved.town?.name, displayTownPopulationTierLabel(step.tier)), "info", "success");
  }
};

/**
 * Drops finished transitions and marks each one's tile changed, so the 3D map
 * rebuilds that town as a plain instance. Without this the growing and
 * collapsed sinking instances (and their shader timing) would linger until
 * some unrelated rebuild -- and replay once the town shader clock wraps.
 * Called every 3D frame (client-map-3d-fx-cast-overlays.ts).
 */
export const expireTownTierUpgrades = (
  state: TownTierUpgradeFxState & { tilesRevision: number; tilesRevisionChangedKeys: Set<string>; tilesRevisionOverflowed: boolean },
  nowEpochMs: number
): void => {
  for (const [key, entry] of state.townTierUpgradeFxByKey) {
    if (nowEpochMs - entry.startedAt < TOWN_GROWTH_DUST_MS) continue;
    state.townTierUpgradeFxByKey.delete(key);
    state.tilesRevision += 1;
    recordTileRevisionChange(state, entry.x, entry.y);
  }
};

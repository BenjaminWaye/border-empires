import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";
import {
  recordTownTierUpgrade,
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

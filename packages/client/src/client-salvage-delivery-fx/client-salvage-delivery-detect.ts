import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import {
  recordSalvageDelivery,
  salvageMarcherTargets,
  salvageShipmentLanded,
  type SalvageDeliveryFxState
} from "./client-salvage-delivery-fx.js";

const FALLBACK_COLOR = "#d8c79a";

/**
 * Scans a merged TILE_DELTA_BATCH for the viewer's own Reclamation Works that
 * just shipped a load of salvage to the Court, and starts the Imperial
 * delivery (dropship + marching Ancillaries) on each. Snapshots of the shipped
 * counts must be taken before the merge (snapshotSalvageLoadsShipped).
 */
export const emitSalvageDeliveries = (input: {
  readonly state: SalvageDeliveryFxState & { me: string; tiles: ReadonlyMap<string, Tile>; playerColors: ReadonlyMap<string, string> };
  readonly tileUpdates: ReadonlyArray<{ x: number; y: number }>;
  readonly previousShippedByKey: ReadonlyMap<string, number | undefined>;
  readonly keyFor: (x: number, y: number) => string;
  readonly nowEpochMs: number;
}): void => {
  const { state, keyFor } = input;
  for (const update of input.tileUpdates) {
    const key = keyFor(update.x, update.y);
    if (!salvageShipmentLanded(input.previousShippedByKey.get(key), state.tiles.get(key), state.me)) continue;
    const marchers = salvageMarcherTargets(
      update,
      (x, y) => state.tiles.get(keyFor(x, y))?.ownerId === state.me,
      { width: WORLD_WIDTH, height: WORLD_HEIGHT }
    );
    recordSalvageDelivery(state, key, {
      x: update.x,
      y: update.y,
      startedAt: input.nowEpochMs,
      color: state.playerColors.get(state.me) ?? FALLBACK_COLOR,
      marchers
    });
  }
};

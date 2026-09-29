import type { Tile } from "../client-types.js";

/** How long the 2D AFC glyph pulses after a delivery lands (ms). */
export const AFC_DELIVERY_2D_PULSE_MS = 1200;

/** Cap on undrained 3D queue entries: the queue only drains while the true-3D renderer runs, so a 2D-only session must not grow it forever. */
const AFC_DELIVERY_QUEUE_CAP = 32;

export type AfcModuleDeliveryFxEntry = { x: number; y: number; techId: string; queuedAt: number };

/** Snapshot of a tile's docked AFC modules taken *before* a tile-delta batch is
 * merged. `undefined` means "no AFC known on this tile" -- either we had never
 * seen the tile (first sight / vision change) or it carried no AFC. Both are
 * deliberately not deliveries: the whole-AFC arrival is a separate event. */
export const snapshotAfcModules = (tile: Pick<Tile, "afc"> | undefined): ReadonlySet<string> | undefined =>
  tile?.afc ? new Set(tile.afc.modules ?? []) : undefined;

type DetectInput = {
  readonly tileUpdates: ReadonlyArray<{ x: number; y: number }>;
  readonly previousAfcModulesByKey: ReadonlyMap<string, ReadonlySet<string> | undefined>;
  readonly tiles: ReadonlyMap<string, Tile>;
  readonly me: string;
  readonly keyFor: (x: number, y: number) => string;
  readonly nowMs: number;
};

/** Finds modules that newly docked on one of the viewer's own AFCs in this
 * batch. Owner-only and never replayed on reconnect (INIT does not go through
 * the tile-delta path), per the plan's Design decision 1. */
export const detectAfcModuleDeliveries = (input: DetectInput): AfcModuleDeliveryFxEntry[] => {
  const out: AfcModuleDeliveryFxEntry[] = [];
  for (const update of input.tileUpdates) {
    const key = input.keyFor(update.x, update.y);
    const previous = input.previousAfcModulesByKey.get(key);
    if (!previous) continue;
    const afc = input.tiles.get(key)?.afc;
    if (!afc || afc.ownerId !== input.me) continue;
    for (const techId of afc.modules ?? []) {
      if (!previous.has(techId)) out.push({ x: update.x, y: update.y, techId, queuedAt: input.nowMs });
    }
  }
  return out;
};

/** Queues the detected deliveries for the 3D drain and stamps the 2D pulse map,
 * pruning expired stamps so the map stays bounded by recent deliveries. */
export const recordAfcModuleDeliveries = (
  state: {
    afcModuleDeliveryFxQueue: AfcModuleDeliveryFxEntry[];
    afcModuleDeliveryLandedAt: Map<string, number>;
  },
  deliveries: readonly AfcModuleDeliveryFxEntry[],
  keyFor: (x: number, y: number) => string,
  nowMs: number
): void => {
  for (const [key, landedAt] of state.afcModuleDeliveryLandedAt) {
    if (nowMs - landedAt > AFC_DELIVERY_2D_PULSE_MS) state.afcModuleDeliveryLandedAt.delete(key);
  }
  for (const delivery of deliveries) {
    state.afcModuleDeliveryFxQueue.push(delivery);
    if (state.afcModuleDeliveryFxQueue.length > AFC_DELIVERY_QUEUE_CAP) state.afcModuleDeliveryFxQueue.shift();
    state.afcModuleDeliveryLandedAt.set(keyFor(delivery.x, delivery.y), nowMs);
  }
};

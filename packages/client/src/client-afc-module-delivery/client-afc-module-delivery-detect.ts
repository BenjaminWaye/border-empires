import { AFC_SOCKET_COUNT } from "../client-map-3d-fabrication-complex.js";
import type { Tile } from "../client-types.js";

export type AfcModuleDeliveryFxEntry = { x: number; y: number; slot: number; techId: string; queuedAt: number };

/** Snapshot of an AFC tile's docked modules taken BEFORE a tile-delta batch
 * merges. `undefined` means the tile had no AFC in the client cache yet. */
export const snapshotAfcModules = (tile: Tile | undefined): ReadonlySet<string> | undefined =>
  tile?.afc ? new Set(tile.afc.modules ?? []) : undefined;

/**
 * Queues one delivery FX per module newly docked on one of MY AFCs by a tile
 * delta. `slot` is the module's index in `afc.modules`, which is exactly the
 * socket the renderer docks it into (createAfcOverlayGroup.addAfc), so the
 * landing streak hits the socket the module then appears in.
 *
 * Only fires when we already had an AFC snapshot for the tile: a tile first
 * seen in this batch (vision change, resync) carries its modules as history,
 * not as a fresh delivery. Modules past the last socket render nowhere, so
 * they get no landing either.
 */
export const queueAfcModuleDeliveries = (params: {
  readonly tileUpdates: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly previousModulesByKey: ReadonlyMap<string, ReadonlySet<string> | undefined>;
  readonly tiles: ReadonlyMap<string, Tile>;
  readonly me: string;
  readonly keyFor: (x: number, y: number) => string;
  readonly queue: AfcModuleDeliveryFxEntry[];
  // Latest-delivery stamp per AFC tile (performance.now clock) for the 2D pulse.
  readonly deliveredAtByKey: Map<string, number>;
  readonly nowMs: number;
}): void => {
  for (const update of params.tileUpdates) {
    const key = params.keyFor(update.x, update.y);
    const previous = params.previousModulesByKey.get(key);
    const resolved = params.tiles.get(key);
    if (!previous || !resolved?.afc || resolved.ownerId !== params.me) continue;
    (resolved.afc.modules ?? []).forEach((techId, slot) => {
      if (previous.has(techId) || slot >= AFC_SOCKET_COUNT) return;
      params.queue.push({ x: update.x, y: update.y, slot, techId, queuedAt: params.nowMs });
      params.deliveredAtByKey.set(key, performance.now());
    });
  }
};

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { computeLinkedDockRevealTileKeys } from "./dock-network/dock-network.js";
type TileDeltas = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"];
export interface LinkedDockDeltaContext {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  tileDeltaFromState: (tile: DomainTileState) => TileDeltas[number];
}
const simulationTileKey = (x: number, y: number): string => `${x},${y}`;
/** Include newly visible physical dock-link endpoints in the original tile event. */
export function expandTileDeltasWithLinkedDocks(context: LinkedDockDeltaContext, deltas: TileDeltas): TileDeltas {
    const dockTileKeysInBatch: string[] = [];
    for (const delta of deltas) {
      if (!delta.dockId) continue;
      const tile = context.tiles.get(simulationTileKey(delta.x, delta.y));
      if (tile?.ownershipState !== "SETTLED") continue;
      dockTileKeysInBatch.push(simulationTileKey(delta.x, delta.y));
    }
    if (dockTileKeysInBatch.length === 0) return deltas;
    const revealKeys = computeLinkedDockRevealTileKeys(
      dockTileKeysInBatch,
      context.dockLinksByDockTileKey,
      WORLD_WIDTH,
      WORLD_HEIGHT
    );
    if (revealKeys.size === 0) return deltas;
    const seen = new Set<string>(deltas.map((delta) => simulationTileKey(delta.x, delta.y)));
    const additional: typeof deltas = [];
    for (const tileKey of revealKeys) {
      if (seen.has(tileKey)) continue;
      const tile = context.tiles.get(tileKey);
      if (!tile) continue;
      additional.push(context.tileDeltaFromState(tile));
    }
    if (additional.length === 0) return deltas;
    return [...deltas, ...additional];
}

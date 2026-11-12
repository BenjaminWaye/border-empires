import type { StoredSimulationCommand } from "../command-store/command-store.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";

export type SalvageFieldBackfillResult = { cleared: number; worksRemoved: number };

/**
 * One-time repair for salvage fields emptied before #2723.
 *
 * Until then an emptied (or stripped-then-dismantled) salvage field's clear
 * never reached disk: v1 checkpoints did not store `resource`, and the
 * TILE_DELTA that cleared it was persisted with `resource: undefined`, which
 * JSON drops. Every restart regenerated PRECURSOR_SALVAGE from worldgen, so
 * the field came back with no Reclamation Works and could be stripped again.
 *
 * The only surviving evidence is the command log (SHIP_SALVAGE_TO_COURT rows
 * are kept for the retention window, 3 days by default). A field is cleared
 * when this season's resolved shipments from it outnumber the loads its
 * current Reclamation Works has recorded: some earlier Works that shipped
 * loads is gone, which only happens when the field was emptied or ruined.
 * A Works rebuilt on such a resurrected field is removed with it. Shipments
 * pruned by retention only make the count smaller, so the repair never
 * clears a field the log can't prove was stripped. Idempotent: a cleared
 * field no longer holds PRECURSOR_SALVAGE and is skipped on later boots.
 */
export const backfillEmptiedSalvageFields = (
  tiles: RecoveredSimulationState["tiles"],
  resolvedShipments: readonly StoredSimulationCommand[]
): SalvageFieldBackfillResult => {
  const shipmentsByTile = new Map<string, number>();
  for (const command of resolvedShipments) {
    const key = shipmentTileKey(command.payloadJson);
    if (key) shipmentsByTile.set(key, (shipmentsByTile.get(key) ?? 0) + 1);
  }
  const result: SalvageFieldBackfillResult = { cleared: 0, worksRemoved: 0 };
  if (shipmentsByTile.size === 0) return result;
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    if (tile.resource !== "PRECURSOR_SALVAGE") continue;
    const shipped = shipmentsByTile.get(`${tile.x},${tile.y}`) ?? 0;
    if (shipped === 0) continue;
    const works = tile.economicStructure?.type === "RECLAMATION_WORKS" ? tile.economicStructure : undefined;
    if (shipped <= (works?.salvageLoadsShipped ?? 0)) continue;
    const { resource: _resource, ...withoutResource } = tile;
    if (works) {
      const { economicStructure: _works, ...withoutWorks } = withoutResource;
      tiles[index] = withoutWorks;
      result.worksRemoved += 1;
    } else {
      tiles[index] = withoutResource;
    }
    result.cleared += 1;
  }
  return result;
};

const shipmentTileKey = (payloadJson: string): string | undefined => {
  try {
    const payload = JSON.parse(payloadJson) as { x?: unknown; y?: unknown };
    return Number.isInteger(payload.x) && Number.isInteger(payload.y) ? `${payload.x},${payload.y}` : undefined;
  } catch {
    return undefined;
  }
};

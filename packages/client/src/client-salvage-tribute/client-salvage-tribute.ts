import { SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE, salvageLoadsRemaining, salvageTributeManpower } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";

/** "Ship salvage to the Court" on your own working Reclamation Works. DOM action shared by the canvas and true-3D maps. */
export function salvageTributeActions(state: Pick<ClientState, "me" | "manpower" | "manpowerCap">, tile: Tile): TileActionDef[] {
  const works = tile.economicStructure;
  if (tile.fogged || !state.me || tile.ownerId !== state.me || tile.resource !== "PRECURSOR_SALVAGE" ||
      works?.ownerId !== state.me || works.type !== "RECLAMATION_WORKS") return [];
  const loads = salvageLoadsRemaining(works);
  const delivered = Math.round(salvageTributeManpower(state.manpower, state.manpowerCap));
  const reason = tile.ownershipState !== "SETTLED" || works.status !== "active" ? "Reclamation Works must be active and garrisoned"
    : loads <= 0 ? "This salvage field is empty"
    : delivered <= 0 ? "Your manpower is already full" : "";
  const lastLoad = loads === 1 ? " This is the last load: the field and its Works will be gone, and so will its +1% attack and defense." : "";
  return [{
    id: "ship_salvage_to_court", label: "Ship salvage to the Court",
    detail: `The Court sends an Imperial delivery of ancillaries worth ${Math.round(SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE * 100)}% of your manpower cap, never above it.${lastLoad}`,
    cost: `1 of ${loads} loads → +${delivered} manpower`,
    disabled: Boolean(reason), ...(reason ? { disabledReason: reason } : {})
  }];
}

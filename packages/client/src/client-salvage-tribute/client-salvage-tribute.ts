import { SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE, salvageLoadsRemaining, salvageTributeManpower } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";

export type SalvageTributeState = Pick<ClientState, "me" | "manpower" | "manpowerCap">;

/** What shipping one load from this tile would do now; undefined when it isn't your salvage Works. */
export interface SalvageTributeStatus {
  readonly loads: number;
  readonly delivered: number;
  /** Why it can't ship right now; empty when it can. */
  readonly reason: string;
}

export function salvageTributeStatus(state: SalvageTributeState, tile: Tile | undefined): SalvageTributeStatus | undefined {
  const works = tile?.economicStructure;
  if (!tile || tile.fogged || !state.me || tile.ownerId !== state.me || tile.resource !== "PRECURSOR_SALVAGE" ||
      works?.ownerId !== state.me || works.type !== "RECLAMATION_WORKS") return undefined;
  const loads = salvageLoadsRemaining(works);
  const delivered = Math.round(salvageTributeManpower(state.manpower, state.manpowerCap));
  const reason = tile.ownershipState !== "SETTLED" || works.status !== "active" ? "Reclamation Works must be active and garrisoned"
    : loads <= 0 ? "This salvage field is empty"
    : delivered <= 0 ? "Your manpower is already full" : "";
  return { loads, delivered, reason };
}

export const SALVAGE_LAST_LOAD_NOTE = "This is the last load: the field and its Works will be gone, and so will its +1% attack and defense.";

/** "Ship salvage to the Court" on your own working Reclamation Works. DOM action shared by the canvas and true-3D maps. */
export function salvageTributeActions(state: SalvageTributeState, tile: Tile): TileActionDef[] {
  const status = salvageTributeStatus(state, tile);
  if (!status) return [];
  const { loads, delivered, reason } = status;
  const lastLoad = loads === 1 ? ` ${SALVAGE_LAST_LOAD_NOTE}` : "";
  return [{
    id: "ship_salvage_to_court", label: "Ship salvage to the Court",
    detail: `The Court sends an Imperial delivery of ancillaries worth ${Math.round(SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE * 100)}% of your manpower cap, never above it.${lastLoad}`,
    cost: `1 of ${loads} loads → +${delivered} manpower`,
    // Ready to ship: the gold primary button (HUD bar) / highlighted row (tile menu).
    ...(reason ? { disabled: true, disabledReason: reason } : { disabled: false, recommended: true })
  }];
}

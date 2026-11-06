import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileActionDef } from "./client-types.js";
import { forcedAncillarificationActions } from "./client-forced-ancillarification/client-forced-ancillarification.js";
import { salvageTributeActions } from "./client-salvage-tribute/client-salvage-tribute.js";

/** One-shot commands on your own structures (Forced Ancillarification, salvage tribute), appended to the tile menu. */
export const structureCommandActions = (state: ClientState, tile: Tile): TileActionDef[] =>
  [...forcedAncillarificationActions(state, tile), ...salvageTributeActions(state, tile)];

// Rows layered onto every single-tile action list after the per-tile rules
// in client-tile-action-logic.ts (kept out of that oversized file): structure
// commands, "Cancel March" on an own March-To destination, and the
// Attack En Route gate on a target an own attack is already heading for.

import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { structureCommandActions } from "../client-structure-command-actions.js";
import { appendMarchCancelAction } from "../client-muster-march-targeting.js";
import { gateAttackEnRouteActions } from "../client-attack-en-route-gate/client-attack-en-route-gate.js";

export const finishSingleTileActions = (base: TileActionDef[], state: ClientState, tile: Tile): TileActionDef[] =>
  gateAttackEnRouteActions(appendMarchCancelAction([...base, ...structureCommandActions(state, tile)], state, tile), state, tile);

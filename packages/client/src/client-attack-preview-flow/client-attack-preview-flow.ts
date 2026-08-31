import {
  attackPreviewBreakdownForTarget as attackPreviewBreakdownForTargetFromModule,
  attackPreviewDetailForTarget as attackPreviewDetailForTargetFromModule,
  attackPreviewIsStaleForTarget as attackPreviewIsStaleForTargetFromModule,
  attackPreviewManpowerCostForTarget as attackPreviewManpowerCostForTargetFromModule,
  attackPreviewPendingForTarget as attackPreviewPendingForTargetFromModule,
  requestAttackPreviewForHover as requestAttackPreviewForHoverFromModule
} from "../client-queue-logic/client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileCombatBreakdown } from "../client-types.js";

// Read-only attack-preview accessors bound to this session's state/deps --
// extracted out of client-action-flow.ts (which just destructures the
// result) so that file doesn't keep growing past the repo's
// 500-line-file-growth limit. requestAttackPreviewForTarget itself stays in
// client-action-flow.ts since its onPreviewTimeout callback needs
// openSingleTileActionMenu, which is declared later in that same closure.
export const createAttackPreviewReaders = (
  state: ClientState,
  deps: {
    ws: RealtimeSocket;
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
) => ({
  requestAttackPreviewForHover: (): void =>
    requestAttackPreviewForHoverFromModule(state, {
      ws: deps.ws,
      authSessionReady: state.authSessionReady,
      keyFor: deps.keyFor,
      pickOriginForTarget: deps.pickOriginForTarget
    }),
  attackPreviewDetailForTarget: (to: Tile): string | undefined =>
    attackPreviewDetailForTargetFromModule(state, to, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget }),
  attackPreviewPendingForTarget: (to: Tile): boolean =>
    attackPreviewPendingForTargetFromModule(state, to, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget }),
  attackPreviewIsStaleForTarget: (to: Tile): boolean =>
    attackPreviewIsStaleForTargetFromModule(state, to, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget }),
  attackPreviewManpowerCostForTarget: (to: Tile): string | undefined =>
    attackPreviewManpowerCostForTargetFromModule(state, to, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget }),
  attackPreviewBreakdownForTarget: (to: Tile): TileCombatBreakdown | undefined =>
    attackPreviewBreakdownForTargetFromModule(state, to, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget })
});

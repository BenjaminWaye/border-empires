import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/**
 * The diagnostic snapshot attached to every server ERROR the client logs
 * (console + the downloadable debug bundle). Extracted from client-network.ts's
 * error handler, which is long enough already, and kept in one place so the
 * debug bundle's shape stays stable for anyone reading a user-submitted log.
 */
export type ServerErrorContext = Record<string, unknown>;

export const buildServerErrorContext = (
  state: ClientState,
  input: { code: unknown; message: unknown; failedTargetKey: string; failedTargetTile: Tile | undefined }
): ServerErrorContext => ({
  code: input.code,
  message: input.message,
  playerGold: state.gold,
  playerStrategicResources: { ...state.strategicResources },
  actionInFlight: state.actionInFlight,
  actionTargetKey: input.failedTargetKey,
  // Only the fields that matter for diagnosing a rejection — a whole Tile
  // carries heavy detail payloads that bloat the bundle without helping.
  actionTargetTile: input.failedTargetTile
    ? {
        x: input.failedTargetTile.x,
        y: input.failedTargetTile.y,
        ownerId: input.failedTargetTile.ownerId,
        ownershipState: input.failedTargetTile.ownershipState,
        optimisticPending: input.failedTargetTile.optimisticPending,
        detailLevel: input.failedTargetTile.detailLevel
      }
    : undefined,
  actionCurrent: state.actionCurrent,
  queuedActions: state.actionQueue.length,
  selected: state.selected,
  hover: state.hover
});

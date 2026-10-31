import type { DomainTileState } from "@border-empires/game-domain";

import type { PersonalImpactDock } from "./personal-impact-log.js";

export type DockChangeImpactContext = {
  now: () => number;
  recordPersonalImpact?: (event: PersonalImpactDock) => void;
};

/**
 * Records DOCK_CAPTURED for the new owner and DOCK_LOST for the old one when a
 * dock tile changes hands. Docks are not flip features (territory-flip-
 * features.ts), so this note is the only place the timeline names them --
 * every path that hands a dock tile to another player must call it.
 */
export const recordDockChangeImpacts = (
  context: DockChangeImpactContext,
  previousTile: DomainTileState | undefined,
  newOwnerId: string | undefined,
  commandId: string
): void => {
  const previousOwnerId = previousTile?.ownerId;
  if (!previousTile?.dockId || !previousOwnerId || !newOwnerId || previousOwnerId === newOwnerId) return;
  const occurredAt = context.now();
  const at = { occurredAt, x: previousTile.x, y: previousTile.y };
  context.recordPersonalImpact?.({ id: `dock-captured:${commandId}`, kind: "DOCK_CAPTURED", playerId: newOwnerId, ...at, counterpartyPlayerId: previousOwnerId });
  context.recordPersonalImpact?.({ id: `dock-lost:${commandId}`, kind: "DOCK_LOST", playerId: previousOwnerId, ...at, counterpartyPlayerId: newOwnerId });
};

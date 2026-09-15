import type { Tile } from "../client-types.js";
import { showWaystationActivationOverlay, type WaystationActivationInfo } from "./client-waystation-activation.js";

export type WaystationActivationUpdate = { x: number; y: number };

/** Snapshot of a tile's waystation state taken before a TILE_DELTA_BATCH is merged in. */
export type PreviousWaystationSnapshot = { activated?: boolean };

/**
 * Scans a TILE_DELTA_BATCH for a tile whose waystation just transitioned
 * from dormant (undefined, or `{ activated: false }`) to activated by the
 * local player, and shows the activation-result popup for at most one such
 * tile per batch (mirroring emitTownCaptureIfCaptured's "one popup per
 * batch" choice -- multi-activation batches are rare and stacking several
 * popups instantly would be worse than showing one).
 *
 * Looks up the granted tech's display name from `techCatalog` (the same
 * catalog the Tech Tree UI already renders from) rather than duplicating a
 * tech-name lookup -- see client-tech-html.ts's `tech?.name` usage.
 */
export const emitWaystationActivationIfActivated = (
  input: {
    tileUpdates: WaystationActivationUpdate[];
    previousWaystationByKey: Map<string, PreviousWaystationSnapshot | undefined>;
    tiles: Map<string, Tile>;
    me: string;
    keyFor: (x: number, y: number) => string;
    techCatalog: ReadonlyArray<{ id: string; name: string }>;
    onJumpToLocation: (x: number, y: number) => void;
  },
  deps: { showOverlay: (info: WaystationActivationInfo) => void } = { showOverlay: showWaystationActivationOverlay }
): void => {
  for (const update of input.tileUpdates) {
    const key = input.keyFor(update.x, update.y);
    const tile = input.tiles.get(key);
    const waystation = tile?.waystation;
    if (!waystation?.activated || waystation.activatedByPlayerId !== input.me || !waystation.grantedEffect) continue;
    const previous = input.previousWaystationByKey.get(key);
    if (previous?.activated) continue; // Already activated before this batch -- not a fresh transition (e.g. a boot resync).

    const revealedTown =
      waystation.grantedEffect === "VISION" &&
      typeof waystation.revealedAtX === "number" &&
      typeof waystation.revealedAtY === "number" &&
      (waystation.revealedAtX !== update.x || waystation.revealedAtY !== update.y);

    const grantedTechName = waystation.grantedTechId ? input.techCatalog.find((t) => t.id === waystation.grantedTechId)?.name : undefined;
    deps.showOverlay({
      x: update.x,
      y: update.y,
      grantedEffect: waystation.grantedEffect,
      revealedTown,
      ...(typeof waystation.revealedAtX === "number" ? { revealedAtX: waystation.revealedAtX } : {}),
      ...(typeof waystation.revealedAtY === "number" ? { revealedAtY: waystation.revealedAtY } : {}),
      ...(grantedTechName ? { grantedTechName } : {}),
      ...(waystation.grantedResource ? { grantedResource: waystation.grantedResource } : {}),
      onJumpToLocation: () => input.onJumpToLocation(waystation.revealedAtX ?? update.x, waystation.revealedAtY ?? update.y)
    });
    return;
  }
};

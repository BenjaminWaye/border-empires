import type { Tile } from "../client-types.js";
import { showWaystationActivationOverlay, type WaystationActivationInfo } from "./client-waystation-activation.js";

export type WaystationActivationUpdate = { x: number; y: number };

/** Snapshot of a tile's waystation state taken before a TILE_DELTA_BATCH is merged in. */
export type PreviousWaystationSnapshot = { activated?: boolean };

/** The subset of a waystation's granted-effect detail this popup needs -- shaped to match both `Tile["waystation"]` (the live path) and a WAYSTATION_ACTIVATED event-log entry (the reconnect catch-up path), so buildWaystationActivationInfo below can serve both without either caller reshaping its data first. */
export type WaystationActivationDetail = {
  activated?: boolean;
  activatedByPlayerId?: string;
  grantedEffect?: WaystationActivationInfo["grantedEffect"];
  revealedAtX?: number;
  revealedAtY?: number;
  grantedTechId?: string;
  grantedResource?: WaystationActivationInfo["grantedResource"];
  grantedTownName?: string;
  grantedTownX?: number;
  grantedTownY?: number;
};

/**
 * Builds the popup payload for an activated-and-owned-by-me waystation, or
 * undefined if it isn't a qualifying activation (dormant, not mine, or
 * missing its granted effect). Shared by the live TILE_DELTA_BATCH path
 * below and the reconnect catch-up path (client-waystation-activation-catchup.ts)
 * so both popups render identically.
 */
export const buildWaystationActivationInfo = (
  waystation: WaystationActivationDetail | undefined,
  x: number,
  y: number,
  me: string,
  techCatalog: ReadonlyArray<{ id: string; name: string }>,
  onJumpToLocation: () => void,
  onViewTech?: (techId: string) => void
): WaystationActivationInfo | undefined => {
  if (!waystation?.activated || waystation.activatedByPlayerId !== me || !waystation.grantedEffect) return undefined;
  const revealedTown =
    waystation.grantedEffect === "VISION" &&
    typeof waystation.revealedAtX === "number" &&
    typeof waystation.revealedAtY === "number" &&
    (waystation.revealedAtX !== x || waystation.revealedAtY !== y);
  const grantedTechName = waystation.grantedTechId ? techCatalog.find((t) => t.id === waystation.grantedTechId)?.name : undefined;
  return {
    x,
    y,
    grantedEffect: waystation.grantedEffect,
    revealedTown,
    ...(typeof waystation.revealedAtX === "number" ? { revealedAtX: waystation.revealedAtX } : {}),
    ...(typeof waystation.revealedAtY === "number" ? { revealedAtY: waystation.revealedAtY } : {}),
    ...(grantedTechName ? { grantedTechName, grantedTechId: waystation.grantedTechId } : {}),
    ...(waystation.grantedResource ? { grantedResource: waystation.grantedResource } : {}),
    ...(waystation.grantedTownName ? { grantedTownName: waystation.grantedTownName } : {}),
    ...(typeof waystation.grantedTownX === "number" ? { grantedTownX: waystation.grantedTownX } : {}),
    ...(typeof waystation.grantedTownY === "number" ? { grantedTownY: waystation.grantedTownY } : {}),
    onJumpToLocation,
    ...(onViewTech ? { onViewTech } : {})
  };
};

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
    /** Opens the tech detail panel for a tech id, wiring the TECH reward's clickable "Unlocked: <name>" line. Omit to render that line as plain text. */
    onViewTech?: (techId: string) => void;
  },
  deps: {
    showOverlay: (info: WaystationActivationInfo) => void;
    markSeen?: (x: number, y: number) => void;
    /** Checks the same persisted "already shown" set the reconnect catch-up path uses (client-waystation-activation-catchup.ts), so an eventLog sync that raced ahead of this TILE_DELTA_BATCH and already popped the popup doesn't cause a second one here. */
    isSeen?: (x: number, y: number) => boolean;
  } = {
    showOverlay: showWaystationActivationOverlay
  }
): void => {
  for (const update of input.tileUpdates) {
    const key = input.keyFor(update.x, update.y);
    const tile = input.tiles.get(key);
    const previous = input.previousWaystationByKey.get(key);
    if (previous?.activated) continue; // Already activated before this batch -- not a fresh transition (e.g. a boot resync).
    const waystation = tile?.waystation;
    if (!waystation?.activated) continue;
    // Jump target depends on the effect: VISION jumps to the revealed town,
    // POPULATION jumps to the town that got the burst, everything else has
    // no jump button so it falls back to the waystation's own tile.
    const jumpX = waystation.grantedEffect === "POPULATION" ? waystation.grantedTownX ?? update.x : waystation.revealedAtX ?? update.x;
    const jumpY = waystation.grantedEffect === "POPULATION" ? waystation.grantedTownY ?? update.y : waystation.revealedAtY ?? update.y;
    const info = buildWaystationActivationInfo(
      waystation,
      update.x,
      update.y,
      input.me,
      input.techCatalog,
      () => input.onJumpToLocation(jumpX, jumpY),
      input.onViewTech
    );
    if (!info) continue;
    if (deps.isSeen?.(update.x, update.y)) continue;
    deps.markSeen?.(update.x, update.y);
    deps.showOverlay(info);
    return;
  }
};

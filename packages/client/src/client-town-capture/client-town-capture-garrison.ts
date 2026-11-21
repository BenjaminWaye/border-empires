// The capture card's "Garrison now" button. A captured town lands as your FRONTIER and gives no coin or
// manpower until it is garrisoned, which players missed (2026-11-21 playtest). The card can show long after
// the capture (it waits out an open deal and other cards), so its state is read from the live tiles when it
// mounts and again on the press, never from the capture snapshot.
import type { ClientState } from "../client-state/client-state.js";
import { garrisonPlannedTileKeys, isOwnTownUngarrisoned } from "../client-town-growth/client-town-growth.js";

type GarrisonState = Pick<ClientState, "autoSettle" | "tiles" | "me" | "developmentQueue" | "settleProgressByTile" | "autoSettleTargets">;

/**
 * "ungarrisoned": nobody has sent a garrison (auto: the towns auto-garrison pref is on, which still waits on
 * coin and manpower, so the button stays). "on_its_way": queued, planned or under way. "garrisoned": SETTLED.
 * Undefined when the tile isn't your town any more, or nothing is installed (Storybook, early boot).
 */
export type TownCaptureGarrisonStatus = { status: "ungarrisoned"; auto: boolean } | { status: "on_its_way" } | { status: "garrisoned" };

let installed: { state: GarrisonState; garrisonSelected: () => void } | undefined;

/** Post-bootstrap: the action flow's Garrison on the selected tile (town + its ring; refuses a non-frontier tile). */
export const installTownCaptureGarrison = (state: GarrisonState, garrisonSelected: () => void): void => {
  installed = { state, garrisonSelected };
};

export const townCaptureGarrisonStatus = (x: number, y: number): TownCaptureGarrisonStatus | undefined => {
  if (!installed) return undefined;
  const { state } = installed;
  const tile = state.tiles.get(`${x},${y}`);
  if (!tile?.town || !state.me || tile.ownerId !== state.me) return undefined;
  if (tile.ownershipState === "SETTLED") return { status: "garrisoned" };
  if (isOwnTownUngarrisoned(tile, state.me, garrisonPlannedTileKeys(state))) {
    return { status: "ungarrisoned", auto: state.autoSettle.status === "loaded" && state.autoSettle.prefs.towns };
  }
  return tile.ownershipState === "FRONTIER" ? { status: "on_its_way" } : undefined;
};

/** Selects the town (`select`) and garrisons it, only if it still needs one. Returns whether it was sent. */
export const garrisonCapturedTown = (x: number, y: number, select: () => void): boolean => {
  if (!installed || townCaptureGarrisonStatus(x, y)?.status !== "ungarrisoned") return false;
  select();
  installed.garrisonSelected();
  return true;
};

/** Test-only reset. */
export const resetTownCaptureGarrisonForTest = (): void => {
  installed = undefined;
};

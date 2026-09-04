import type { ReachAnchor } from "@border-empires/shared";

/**
 * Boot-time reconstruction of the persistent reach border.
 *
 * `reachBorder` is deliberately NOT persisted -- it is rebuilt from anchor
 * geometry every boot by replaying each live anchor through the same
 * grantAnchorToBorder path a live activation uses. That replay must keep the
 * rival-SETTLED contest ON (see applyReachAnchorActivationToBorder's doc
 * comment): with it off, an anchor whose disk covered a rival's SETTLED tile
 * silently took the border slot with no `overtaken` entry and therefore no
 * unsettle, leaving `reachOwnerId` = one player and `ownerId`/SETTLED =
 * another. Because the border is rebuilt identically on every restart, that
 * mismatch was permanent and self-renewing rather than self-healing.
 *
 * What the seeding pass does still skip is neutral auto-claim
 * (`skipNeutralAutoClaim`), which would otherwise bulk-flip every neutral
 * tile under every anchor's disk to FRONTIER once at boot.
 */

export type BorderSeedTileView = {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
};

/**
 * Invariant audit: how many tiles are SETTLED by a player other than the one
 * holding the reach-border slot under them. This should be 0 after seeding --
 * the contest resolves every such tile either by leaving the ground to its
 * settled holder (they still defend it with their own live reach) or by
 * taking the slot AND unsettling the loser.
 *
 * Barbarian-held ground is exempt: barbarian territory is environment rather
 * than a bordered empire, contributes no anchors, and is deliberately never
 * overtaken this way (see settleOvertaken's own barbarian guard).
 *
 * A nonzero count is the signal that this class of bug is back; it is logged
 * at boot rather than silently tolerated.
 */
export const countBorderOwnershipMismatches = (
  tiles: Iterable<[string, BorderSeedTileView]>,
  reachBorder: ReadonlyMap<string, string>
): number => {
  let mismatches = 0;
  for (const [tileKey, tile] of tiles) {
    if (tile.ownershipState !== "SETTLED") continue;
    const ownerId = tile.ownerId;
    if (!ownerId || ownerId.startsWith("barbarian-")) continue;
    const borderOwnerId = reachBorder.get(tileKey);
    if (borderOwnerId === undefined || borderOwnerId === ownerId) continue;
    mismatches += 1;
  }
  return mismatches;
};

const countSettled = (tiles: Iterable<[string, BorderSeedTileView]>): number => {
  let settled = 0;
  for (const [, tile] of tiles) if (tile.ownershipState === "SETTLED") settled += 1;
  return settled;
};

export type BorderSeedResult = {
  /** SETTLED tiles the seeding contest reverted to FRONTIER this boot. */
  unsettled: number;
  /** Invariant violations still standing afterwards. Expected to be 0. */
  mismatches: number;
};

/**
 * Replays every live anchor into the persistent border, then reports what the
 * pass did. `reachBorder` is read through a getter because the caller
 * reassigns it on each activation.
 *
 * `unsettled` is the blast radius of a restart: undefended SETTLED ground
 * sitting inside a rival's reach is legal to take, and the boot contest
 * collects every such tile at once rather than one-per-live-event. On a world
 * carrying historical inconsistencies the first boot after this behaviour
 * lands can revert a batch of tiles, so the count is logged rather than left
 * to be discovered from player reports. Steady-state boots should log 0.
 */
export const seedReachBorderFromAnchors = (deps: {
  gatherReachAnchors: () => ReachAnchor[];
  applyReachAnchorActivation: (
    anchor: ReachAnchor,
    causeCommandId: string,
    options: { skipNeutralAutoClaim: true }
  ) => void;
  tiles: Iterable<[string, BorderSeedTileView]>;
  reachBorder: () => ReadonlyMap<string, string>;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
}): BorderSeedResult => {
  const settledBefore = countSettled(deps.tiles);
  for (const anchor of deps.gatherReachAnchors()) {
    deps.applyReachAnchorActivation(anchor, "world-init", { skipNeutralAutoClaim: true });
  }
  const unsettled = settledBefore - countSettled(deps.tiles);
  const mismatches = countBorderOwnershipMismatches(deps.tiles, deps.reachBorder());
  if (unsettled > 0) {
    deps.runtimeLogInfo(
      { unsettled, settledBefore },
      "[reachBorderSeed] reverted undefended SETTLED tiles inside a rival's reach to FRONTIER during border seeding"
    );
  }
  if (mismatches > 0) {
    deps.runtimeLogInfo(
      { mismatches },
      "[reachBorderSeed] SETTLED tiles still held against their reach-border owner after seeding — border/ownership invariant violated"
    );
  }
  return { unsettled, mismatches };
};

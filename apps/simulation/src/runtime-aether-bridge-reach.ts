import { AETHER_BRIDGE_REACH_RADIUS, tileKey, wrapCoord, WORLD_HEIGHT, WORLD_WIDTH, type ReachAnchor } from "@border-empires/shared";

// Current persistent-border owner at a tile, if any -- used by the Aether
// Bridge cast handler to refuse granting bridge reach onto ground already
// inside a RIVAL player's border (the bridge should only open an attack lane
// there, not free colonization of their territory). Landing on neutral
// ground, or ground already the caster's own, still grants reach.
export const reachBorderOwnerAt = (
  reachBorder: ReadonlyMap<string, string>,
  x: number,
  y: number
): string | undefined => reachBorder.get(tileKey(wrapCoord(x, WORLD_WIDTH), wrapCoord(y, WORLD_HEIGHT)));

// Builds the one-shot Aether Bridge reach anchor (AETHER_BRIDGE_REACH_RADIUS
// around the bridge's landing tile), meant to be applied via the runtime's
// normal applyReachAnchorActivation path -- the same one every other reach
// anchor (TOWN/OUTPOST/DOCK) uses. Deliberately NOT added to
// gatherReachAnchors/newlyActivatedReachAnchors: this is a one-time land
// grab, not a persistent live anchor, so per design it stays granted (sticky
// border) even after the bridge itself expires, but is undefended in any
// FUTURE contest -- if a rival later activates their own anchor (e.g. a
// relay beacon) covering this tile, grantAnchorToBorder's defenderLiveReach
// check finds no live anchor of the bridge caster's here and the rival takes
// it, same as any other undefended ground.
export const aetherBridgeReachAnchor = (ownerId: string, x: number, y: number, now: number): ReachAnchor => ({
  x,
  y,
  ownerId,
  activatedAt: now,
  kind: "OUTPOST",
  radiusOverride: AETHER_BRIDGE_REACH_RADIUS
});

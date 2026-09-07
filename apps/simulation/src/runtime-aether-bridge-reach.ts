import { tileKey, wrapCoord, WORLD_HEIGHT, WORLD_WIDTH, type ReachAnchor } from "@border-empires/shared";

// Current persistent-border owner at a tile, if any -- used by the Aether
// Bridge cast handler to refuse granting bridge reach onto ground already
// inside a RIVAL player's border. This is load-bearing, not just an
// anti-abuse nicety: grantAnchorToBorder's contest treats an anchor's own
// tile as an unconditional win regardless of the defender's live reach
// (correct for TOWN/OUTPOST/DOCK, whose own tile truly is the owner's
// already-held ground by construction) -- but the bridge's "own tile" is
// just its target, which may be a rival's actively-defended SETTLED town.
// Without this guard, casting a bridge onto enemy territory would instantly
// and unconditionally overtake it in the border map. Landing on neutral
// ground, or ground already the caster's own, still grants reach.
export const reachBorderOwnerAt = (
  reachBorder: ReadonlyMap<string, string>,
  x: number,
  y: number
): string | undefined => reachBorder.get(tileKey(wrapCoord(x, WORLD_WIDTH), wrapCoord(y, WORLD_HEIGHT)));

// Builds the Aether Bridge landing-tile reach anchor: radius 0 (exactly the
// tile the bridge lands on, not an area around it), applied via the
// runtime's normal applyReachAnchorActivation path -- the same one every
// other reach anchor (TOWN/OUTPOST/DOCK) uses. On genuinely neutral ground,
// that grant's auto-claim gives the caster the tile FRONTIER for free and
// instantly, the same beachhead effect a captured dock has. Unlike every
// other anchor kind, this one is explicitly time-bound to the bridge's own
// lifetime -- see grantAetherBridgeReach/tickAetherBridgeReachExpiry in
// runtime.ts, which track and withdraw it once the bridge expires, instead
// of leaving it permanently sticky the way a real structure's anchor is.
export const aetherBridgeReachAnchor = (ownerId: string, x: number, y: number, now: number): ReachAnchor => ({
  x,
  y,
  ownerId,
  activatedAt: now,
  kind: "OUTPOST",
  radiusOverride: 0,
  // The bridge's entire purpose is to bridge reach across water without a
  // land connection -- exempt it from the land-gating normal TOWN/OUTPOST/
  // DOCK anchors are subject to. See ReachAnchor.crossesWater.
  crossesWater: true
});

export type PendingAetherBridgeReachExpiry = Map<string, { anchor: ReachAnchor; endsAt: number }>;

// Grants a bridge's landing-tile reach anchor via `activate`
// (SimulationRuntime.applyReachAnchorActivation), then tracks it by bridgeId
// so tickAetherBridgeReachExpiry can withdraw it once the bridge expires.
export function grantAetherBridgeReach(
  pending: PendingAetherBridgeReachExpiry,
  playerId: string,
  x: number,
  y: number,
  commandId: string,
  bridgeId: string,
  endsAt: number,
  now: number,
  activate: (anchor: ReachAnchor, causeCommandId: string) => void
): void {
  const anchor = aetherBridgeReachAnchor(playerId, x, y, now);
  activate(anchor, commandId);
  pending.set(bridgeId, { anchor, endsAt });
}

// Sweeps every bridge-landing reach anchor whose bridge has expired, calling
// `deactivate` for each and removing it from `pending`. Anchor activation is
// otherwise sticky (see applyReachAnchorActivation's doc comment).
export function tickAetherBridgeReachExpiry(
  pending: PendingAetherBridgeReachExpiry,
  nowMs: number,
  deactivate: (anchor: ReachAnchor, causeCommandId: string) => void
): void {
  for (const [bridgeId, { anchor, endsAt }] of pending) {
    if (endsAt > nowMs) continue;
    deactivate(anchor, `${bridgeId}:expire`);
    pending.delete(bridgeId);
  }
}

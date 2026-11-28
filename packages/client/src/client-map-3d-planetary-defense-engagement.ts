// Which tiles' Planetary Defense patrols (client-map-3d-planetary-defense-
// overlay.ts) should step aside right now because a battle squad drawn by
// syncBattleOverlayFx (client-map-3d-capture-overlays.ts) is standing in for
// them. Mirrors that function's sources so the soldiers never show twice:
//   - resolved battles (state.activeBattles), either side Planetary Defense;
//   - the pre-resolution siege skirmish while Planetary Defense attacks this
//     player (state.incomingAttacksByTile);
//   - the pre-resolution skirmish of this player's own manual attack or
//     muster-flag attack on a Planetary Defense tile (state.capture /
//     state.outgoingMusterAttacksByTile).
// Both the origin and target tile are marked: the attacker's squad marches
// out from the origin, the defender's stands on the target.
import type { ClientState } from "./client-state/client-state.js";
import { isPlanetaryDefenseOwnerId } from "./client-planetary-defense-style.js";

export type PlanetaryDefenseEngagementState = Pick<
  ClientState,
  "tiles" | "activeBattles" | "incomingAttacksByTile" | "outgoingMusterAttacksByTile" | "capture"
>;

export const planetaryDefenseEngagedTileKeys = (
  state: PlanetaryDefenseEngagementState,
  keyFor: (x: number, y: number) => string,
  // performance.now() clock — what ActiveBattleOverlay.endAt is stamped in.
  nowMs: number,
  // Server epoch ms — what the siege countdowns' resolvesAt are stamped in.
  nowEpochMs: number
): Set<string> => {
  const engaged = new Set<string>();
  const mark = (x: number, y: number): void => {
    engaged.add(keyFor(x, y));
  };
  const isPlanetaryDefenseTile = (x: number, y: number): boolean => isPlanetaryDefenseOwnerId(state.tiles.get(keyFor(x, y))?.ownerId);

  for (const battle of state.activeBattles.values()) {
    if (nowMs >= battle.endAt) continue;
    if (!isPlanetaryDefenseOwnerId(battle.attackerOwnerId) && !isPlanetaryDefenseOwnerId(battle.defenderOwnerId)) continue;
    mark(battle.originX, battle.originY);
    mark(battle.targetX, battle.targetY);
  }

  for (const [key, incoming] of state.incomingAttacksByTile) {
    if (incoming.resolvesAt <= nowEpochMs || !isPlanetaryDefenseOwnerId(incoming.attackerId)) continue;
    engaged.add(key);
    if (incoming.fromX !== undefined && incoming.fromY !== undefined) mark(incoming.fromX, incoming.fromY);
  }

  const capture = state.capture;
  if (capture?.actionType === "ATTACK" && capture.origin && capture.resolvesAt > nowEpochMs && isPlanetaryDefenseTile(capture.target.x, capture.target.y)) {
    mark(capture.target.x, capture.target.y);
  }

  for (const outgoing of state.outgoingMusterAttacksByTile.values()) {
    if (outgoing.isExpand || outgoing.resolvesAt <= nowEpochMs) continue;
    // Still marching (syncMusterTransitOverlay draws that, not a skirmish).
    if (outgoing.transitEndsAt !== undefined && outgoing.transitEndsAt > nowEpochMs) continue;
    if (isPlanetaryDefenseTile(outgoing.targetX, outgoing.targetY)) mark(outgoing.targetX, outgoing.targetY);
  }

  return engaged;
};

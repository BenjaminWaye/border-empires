import type { ClientState } from "../client-state/client-state.js";

type SiegeState = Pick<ClientState, "incomingAttacksByTile">;
type IncomingAttack = NonNullable<ReturnType<ClientState["incomingAttacksByTile"]["get"]>>;

/** Shape of the fields a tile delta can carry that end a siege. Structural so
 * both the gateway-sync path (GatewayTileUpdate) and client-network's raw
 * TILE_DELTA updates can be passed straight in. */
export type SiegeEndingTileUpdate = {
  ownerId?: string | null;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | null;
  combatJson?: string;
};

type KnownTile = { ownerId?: string | undefined; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | undefined };

/** Grace period before a siege whose resolution broadcast never arrived is
 * dropped. Generous on purpose: the resolution delta legitimately lands a
 * little after resolvesAt (server tick granularity + network), and evicting
 * early would cut the dots off right before the pre-resolution clash hands
 * over to the resolved-battle animation. */
export const EXPIRED_SIEGE_GRACE_MS = 10_000;

/** Ends a tracked siege in `incomingAttacksByTile` only when this delta is the
 * combat actually resolving — NOT merely because some delta happened to touch
 * the besieged tile.
 *
 * A tile under attack stays the defender's own territory for the whole ~30s
 * COMBAT_LOCK_MS countdown and keeps receiving ordinary periodic deltas the
 * entire time (yield refresh, population growth, muster/maintenance ticks, …).
 * Both delta paths used to delete unconditionally, so the entry was almost
 * always wiped seconds after ATTACK_ALERT created it — taking the
 * pre-resolution skirmish dots and the red under-attack cross with it, and
 * leaving only the ~2.3s resolution flourish (driven separately, off
 * state.activeBattles) actually visible.
 *
 * The two real end conditions are: the server's combat broadcast rides this
 * delta (`combatJson`, present on both the attacker-won and attacker-lost
 * shapes — see runtime-lock-resolution.ts), or the tile genuinely changed
 * hands, which makes any siege we were tracking stale. Ownership is compared
 * against the tile we already have rather than merely checked for presence,
 * since a full tile delta restates the current owner on every routine tick. */
export const clearResolvedIncomingAttack = (
  state: SiegeState,
  tileKey: string,
  update: SiegeEndingTileUpdate,
  existing: KnownTile | undefined
): void => {
  if (!state.incomingAttacksByTile.has(tileKey)) return;
  const ownershipChanged =
    ("ownerId" in update && (update.ownerId ?? undefined) !== existing?.ownerId) ||
    ("ownershipState" in update && (update.ownershipState ?? undefined) !== existing?.ownershipState);
  if (update.combatJson !== undefined || ownershipChanged) state.incomingAttacksByTile.delete(tileKey);
};

/** Ages out sieges that never produced a resolution broadcast at all (attacker
 * eliminated, command dropped). Without this they would linger forever now
 * that unrelated deltas no longer evict them. */
export const pruneExpiredIncomingAttacks = (state: SiegeState, nowEpochMs: number): void => {
  for (const [key, incoming] of state.incomingAttacksByTile) {
    if (nowEpochMs >= incoming.resolvesAt + EXPIRED_SIEGE_GRACE_MS) state.incomingAttacksByTile.delete(key);
  }
};

/** The 2D map's per-tile under-attack lookup: returns the siege while it should
 * still be drawn, and evicts it once past the grace window (the side effect the
 * call sites previously did inline).
 *
 * Evicting exactly at `resolvesAt` — which is what those call sites used to do
 * — is what the grace window exists to prevent: the resolution broadcast always
 * lands a little after `resolvesAt`, and registerActiveBattleFromTileDelta
 * checks for a live entry here to decide whether to continue an in-progress
 * clash or restart the approach. Dropping it a beat early makes the resolved
 * battle replay its approach and read as two disjoint fights. */
export const drawableIncomingAttack = (state: SiegeState, tileKey: string, nowEpochMs: number): IncomingAttack | undefined => {
  const incoming = state.incomingAttacksByTile.get(tileKey);
  if (!incoming) return undefined;
  if (nowEpochMs >= incoming.resolvesAt + EXPIRED_SIEGE_GRACE_MS) state.incomingAttacksByTile.delete(tileKey);
  return incoming.resolvesAt > nowEpochMs ? incoming : undefined;
};

/** Builds `state.capture` for an accepted/locked frontier action.
 *
 * `origin`/`actionType` are carried purely so the 3D battle overlay can
 * animate this client's OWN outgoing attack for its whole countdown: the
 * server addresses ATTACK_ALERT (which populates incomingAttacksByTile) to the
 * defender only, so without them the attacker has nothing describing the
 * in-flight fight until the resolution broadcast lands. See
 * client-map-3d-capture-overlays.ts. */
export const buildCaptureState = (input: {
  startAt: number;
  resolvesAt: number;
  target: { x: number; y: number };
  origin?: unknown;
  actionType?: unknown;
  silent?: boolean;
  fromMusterAdvance?: boolean;
}): NonNullable<ClientState["capture"]> => {
  const origin = input.origin as { x: number; y: number } | undefined;
  const actionType = input.actionType === "EXPAND" || input.actionType === "ATTACK" ? input.actionType : undefined;
  return {
    startAt: input.startAt,
    resolvesAt: input.resolvesAt,
    target: input.target,
    ...(origin && typeof origin.x === "number" && typeof origin.y === "number" ? { origin: { x: origin.x, y: origin.y } } : {}),
    ...(actionType ? { actionType } : {}),
    ...(input.silent ? { silent: true } : {}),
    ...(input.fromMusterAdvance ? { fromMusterAdvance: true } as const : {})
  };
};

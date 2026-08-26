/**
 * Server-authoritative reach push (REACH_UPDATE).
 *
 * Background: `packages/client/src/client-reach-overlay/client-reach-overlay.ts`
 * used to derive the local player's reach set entirely client-side
 * (`computeLocalReachSet`), by scanning whatever tiles the client happened to
 * have cached and re-deriving anchor radius disks. That approximation cannot
 * see contested-tile clipping against other players' anchors — resolving that
 * needs the global anchor view only the simulation has — so the client's
 * yellow border could claim a tile the server would reject as OUT_OF_REACH.
 * That mismatch is what wedged waypoints: the planner kept re-emitting an
 * EXPAND step its own reach view said was legal and the server kept refusing.
 *
 * This module closes that gap by pushing the authoritative border
 * (`Runtime.reachBorder`, via `reachTileKeysForPlayer`) to each client as a
 * `REACH_UPDATE` player message. It rides the existing PLAYER_MESSAGE event
 * path, which the gateway forwards verbatim, so no gateway or proto change is
 * needed.
 *
 * Emission is change-driven rather than tick-driven: a full reach set for a
 * large empire is hundreds of keys, far too heavy to attach to a hot message
 * like PLAYER_UPDATE. `markReachDirty` is called from the two places that
 * mutate the border (anchor activation and deactivation), and `flushReachUpdates`
 * emits at most one message per player per flush — and only when the set
 * actually differs from what that player was last sent, since most border
 * mutations touch a single owner and leave every other player's set identical.
 */

/** Everything {@link flushReachUpdates} needs from the runtime. */
export type ReachUpdateContext = {
  /** Authoritative reach keys for one player, from the persistent border. */
  reachTileKeysForPlayer: (playerId: string) => string[];
  /** Emits a PLAYER_MESSAGE addressed to one player. */
  emitPlayerMessage: (
    command: { commandId: string; playerId: string },
    payload: Record<string, unknown>
  ) => void;
};

/**
 * Per-player emission bookkeeping. Bounded by the number of players the
 * runtime has ever known (see docs/agents/state-and-persistence-discipline.md).
 * The runtime never removes entries from its own player map — eliminated
 * players are respawned in place, not deleted — so these maps inherit that
 * same bound and need no separate eviction path.
 */
export type ReachUpdateState = {
  readonly dirtyPlayerIds: Set<string>;
  /** Last set emitted per player, joined — the change filter's comparison key. */
  readonly lastEmittedSignatureByPlayer: Map<string, string>;
  /** Monotonic per-player revision, so the client can discard stale arrivals. */
  readonly revisionByPlayer: Map<string, number>;
  /**
   * Tile keys that changed hands for one owner since the last drain — see
   * {@link recordReachChangedTile}. Small and self-cleaning: `settleOvertaken`
   * (runtime-reach-border-apply.ts) records only the tiles a single mutation
   * actually moved, never a full border rescan. rival-reach-push.ts drains
   * this per owner right after observing that owner's REACH_UPDATE, so it can
   * decide which *other* players need a push by checking visibility against
   * this handful of tiles instead of the owner's entire border.
   */
  readonly changedTileKeysByOwner: Map<string, Set<string>>;
};

export const createReachUpdateState = (): ReachUpdateState => ({
  dirtyPlayerIds: new Set<string>(),
  lastEmittedSignatureByPlayer: new Map<string, string>(),
  revisionByPlayer: new Map<string, number>(),
  changedTileKeysByOwner: new Map<string, Set<string>>()
});

/**
 * Records that `tileKey` changed hands and now involves `ownerId`'s border.
 * Called from `settleOvertaken` for both the tile's previous and new owner —
 * a mutation touching one tile can make it relevant to two different
 * rival-reach viewers checks. Barbarians are skipped, same as markReachDirty.
 */
export const recordReachChangedTile = (state: ReachUpdateState, ownerId: string | undefined, tileKey: string): void => {
  if (!ownerId || ownerId.startsWith("barbarian-")) return;
  let keys = state.changedTileKeysByOwner.get(ownerId);
  if (!keys) {
    keys = new Set<string>();
    state.changedTileKeysByOwner.set(ownerId, keys);
  }
  keys.add(tileKey);
};

/**
 * Drains and returns the changed-tile buffer for one owner. Read-once by
 * design: rival-reach-push.ts calls this exactly once per owner per
 * REACH_UPDATE observed, so a later, unrelated caller never sees tiles that
 * were already accounted for.
 */
export const takeReachChangedTileKeys = (state: ReachUpdateState, ownerId: string): string[] => {
  const keys = state.changedTileKeysByOwner.get(ownerId);
  if (!keys || keys.size === 0) return [];
  state.changedTileKeysByOwner.delete(ownerId);
  return [...keys];
};

/**
 * Marks one player's reach as needing a re-push. Cheap and idempotent —
 * callers fire this from inside border-mutation loops without batching.
 * Barbarians are environment, never a bordered empire with a client to push
 * to, so they are skipped here rather than at every call site.
 */
export const markReachDirty = (state: ReachUpdateState, playerId: string | undefined): void => {
  if (!playerId || playerId.startsWith("barbarian-")) return;
  state.dirtyPlayerIds.add(playerId);
};

/**
 * The reach payload for one player, at a fresh revision. Exported for the
 * login-snapshot path, which needs the same shape but sends it directly
 * rather than through the dirty-set flush.
 */
export const buildReachUpdatePayload = (
  state: ReachUpdateState,
  context: ReachUpdateContext,
  playerId: string
): { payload: Record<string, unknown>; signature: string } => {
  // Sorted so the signature is order-independent: `reachTileKeysForPlayer`
  // walks a Map, whose iteration order tracks insertion, so the same border
  // can legitimately enumerate in different orders across two calls.
  const tileKeys = context.reachTileKeysForPlayer(playerId).sort();
  const revision = (state.revisionByPlayer.get(playerId) ?? 0) + 1;
  state.revisionByPlayer.set(playerId, revision);
  return {
    payload: { type: "REACH_UPDATE", tileKeys, revision },
    signature: tileKeys.join("|")
  };
};

/**
 * Emits REACH_UPDATE for every dirty player whose set actually changed, then
 * clears the dirty set. Returns the ids actually emitted to, for logging and
 * tests. Safe to call on every command boundary — the signature check makes a
 * no-op flush free apart from rebuilding the candidate sets.
 */
export const flushReachUpdates = (
  state: ReachUpdateState,
  context: ReachUpdateContext,
  causeCommandId: string
): string[] => {
  if (state.dirtyPlayerIds.size === 0) return [];
  const emitted: string[] = [];
  // Snapshot before iterating: emitPlayerMessage can re-enter the runtime,
  // and a mutation during the walk would otherwise invalidate the iterator.
  const candidates = [...state.dirtyPlayerIds];
  state.dirtyPlayerIds.clear();
  for (const playerId of candidates) {
    const { payload, signature } = buildReachUpdatePayload(state, context, playerId);
    if (state.lastEmittedSignatureByPlayer.get(playerId) === signature) continue;
    state.lastEmittedSignatureByPlayer.set(playerId, signature);
    context.emitPlayerMessage({ commandId: causeCommandId, playerId }, payload);
    emitted.push(playerId);
  }
  return emitted;
};

/**
 * Forces the next flush to emit for this player even if the set is unchanged.
 * Needed on (re)connect: the client starts with no reach at all, so the
 * signature filter would otherwise suppress the one message it most needs.
 */
export const markReachForResend = (state: ReachUpdateState, playerId: string): void => {
  state.lastEmittedSignatureByPlayer.delete(playerId);
  markReachDirty(state, playerId);
};

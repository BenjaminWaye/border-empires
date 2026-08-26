/**
 * Server-authoritative RIVAL reach on the client.
 *
 * `client-reach-overlay-all-owners.ts`'s `computeReachSetsByOwner` derives
 * every OTHER owner's reach from a plain union of anchor-radius disks over
 * whatever tiles the client happens to have cached — it cannot see
 * contested-tile clipping against the local player's own border. That's why
 * the "clashing borders" 3D seam either never appears (the two guessed
 * shapes don't quite touch) or the two borders visually cross (they
 * overlap instead of landing on the same line).
 *
 * The simulation now pushes each visible rival's authoritative, fog-clipped
 * border as RIVAL_REACH_UPDATE (apps/simulation/src/rival-reach-push/). This
 * module owns applying those messages, per owner, mirroring
 * client-reach-authoritative.ts's REACH_UPDATE handling exactly (same
 * per-message revision-staleness guard, same "prefer server data, fall back
 * to the local guess" resolution rule) — just keyed by ownerId instead of
 * being a single value, since there can be many rivals in view at once.
 */

/** The subset of ClientState this module reads and writes. */
export type RivalReachAuthoritativeState = {
  /** Server-pushed reach per rival owner, already fog-clipped by the sim. Only owners the server has sent at least one message for appear here. */
  rivalReach: Map<string, Set<string>>;
  rivalReachRevisionByOwner: Map<string, number>;
  /**
   * Bumped on every accepted RIVAL_REACH_UPDATE, across all owners. Purely a
   * "something changed" tripwire for client-map-3d.ts's rebuild cache key
   * (reach3DKey), which otherwise only tracks tilesRevision + the LOCAL
   * player's own serverReachRevision — a rival-only change (no change to
   * your own border) would never invalidate that cache without this.
   */
  rivalReachGlobalRevision: number;
};

/** Shape of a RIVAL_REACH_UPDATE payload, before validation. */
export type RivalReachUpdateMessage = {
  ownerId?: unknown;
  tileKeys?: unknown;
  revision?: unknown;
};

/**
 * Applies one RIVAL_REACH_UPDATE. Returns true when state changed, so
 * callers can invalidate any cached 3D pylon/segment set and re-render.
 *
 * Same staleness rule as applyServerReachUpdate: a revision at or below the
 * one already applied FOR THIS OWNER is dropped (the transport can reorder,
 * and per-owner revisions are independent — owner A's revision has no
 * bearing on owner B's), except revision 1, which announces a fresh
 * per-(viewer,owner) sequence the same way a reconnect does for REACH_UPDATE.
 */
export const applyRivalReachUpdate = (state: RivalReachAuthoritativeState, message: RivalReachUpdateMessage): boolean => {
  if (typeof message.ownerId !== "string" || message.ownerId.length === 0) return false;
  if (!Array.isArray(message.tileKeys)) return false;
  if (typeof message.revision !== "number" || !Number.isFinite(message.revision) || message.revision < 1) return false;
  const ownerId = message.ownerId;
  const revision = message.revision;
  const currentRevision = state.rivalReachRevisionByOwner.get(ownerId) ?? 0;
  if (revision > 1 && revision <= currentRevision) return false;
  const tileKeys = message.tileKeys.filter((key): key is string => typeof key === "string");
  state.rivalReach.set(ownerId, new Set(tileKeys));
  state.rivalReachRevisionByOwner.set(ownerId, revision);
  state.rivalReachGlobalRevision += 1;
  return true;
};

/**
 * The server-authoritative reach set for one rival owner, or undefined if
 * the server hasn't sent anything for them yet — callers fall back to the
 * local per-owner guess (computeReachSetsByOwner) only in that case, never
 * once real data has arrived.
 */
export const resolveRivalReach = (state: RivalReachAuthoritativeState, ownerId: string): Set<string> | undefined => state.rivalReach.get(ownerId);

/**
 * Drops all server-pushed rival reach — call on disconnect/season rollover,
 * same reasoning as clearServerReach: a stale rival border from a previous
 * session must not outlive the connection that produced it.
 */
export const clearRivalReach = (state: RivalReachAuthoritativeState): void => {
  state.rivalReach.clear();
  state.rivalReachRevisionByOwner.clear();
  state.rivalReachGlobalRevision += 1;
};

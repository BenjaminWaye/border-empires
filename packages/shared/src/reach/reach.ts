import {
  DOCK_REACH_RADIUS,
  OUTPOST_REACH_RADIUS,
  TOWN_REACH_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "../config.js";

/**
 * Fixed-border reach: EXPAND and SETTLE are only legal on tiles inside a
 * player's **ownership border** — a persistent, event-driven grant, not a
 * value recomputed live from currently-active anchors. Once a tile is
 * granted to a player (by a town/outpost/dock's radius covering it), it
 * stays theirs even if the granting structure is later destroyed — sticky
 * territory. It can only be taken by another player's anchor *contesting*
 * it, and even then only succeeds if the current claimant has no
 * currently-active anchor of their own still covering that tile (see
 * `grantAnchorToBorder`). ATTACK is deliberately not reach-gated at all;
 * this module has no bearing on it.
 *
 * Two building blocks:
 * - `liveReachForOwner` — a snapshot of what a single owner's *currently
 *   active* anchors cover right now. Used only to answer "can this owner
 *   defend this tile at this moment" during a contest.
 * - `grantAnchorToBorder` — applies one anchor activation to the persistent
 *   border, resolving any contests via that live-defense check.
 *
 * Distance metric: Chebyshev, toroidally wrapped — same as
 * `packages/shared/src/outpost-aura/outpost-aura.ts`.
 */

export type ReachAnchorKind = "TOWN" | "OUTPOST" | "DOCK";

export type ReachAnchor = {
  x: number;
  y: number;
  ownerId: string;
  /** Event-ordering timestamp. Used only to order processing deterministically. */
  activatedAt: number;
  kind: ReachAnchorKind;
  /**
   * Overrides reachRadiusForKind's kind-based radius for this specific
   * anchor instance. Used by the Aether Bridge landing grant, which reuses
   * "OUTPOST" kind semantics (a one-shot grant, not a persistent structure)
   * but at a smaller radius than OUTPOST_REACH_RADIUS.
   */
  radiusOverride?: number;
};

export const reachRadiusForKind = (kind: ReachAnchorKind): number => {
  if (kind === "TOWN") return TOWN_REACH_RADIUS;
  if (kind === "DOCK") return DOCK_REACH_RADIUS;
  return OUTPOST_REACH_RADIUS; // OUTPOST: RELAY_BEACON, SIEGE_OUTPOST, SIEGE_TOWER, DREAD_TOWER
};

export const reachRadiusForAnchor = (anchor: ReachAnchor): number =>
  anchor.radiusOverride ?? reachRadiusForKind(anchor.kind);

export const wrapCoord = (v: number, size: number): number => ((v % size) + size) % size;

export const tileKey = (x: number, y: number): string => `${x},${y}`;

/** Wrapped Chebyshev distance between two world positions. */
export const chebyshevWithWrap = (ax: number, ay: number, bx: number, by: number): number => {
  const dxRaw = Math.abs(ax - bx);
  const dyRaw = Math.abs(ay - by);
  const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
  const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
  return Math.max(dx, dy);
};

/**
 * Every wrapped tile key within `anchor`'s radius (inclusive), including the
 * anchor's own tile. Iterates only the anchor's local bounding box, not the
 * world grid, so cost is O(radius²) per anchor regardless of world size.
 */
export const tileKeysInReach = (anchor: ReachAnchor): string[] => {
  const radius = reachRadiusForAnchor(anchor);
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = wrapCoord(anchor.x + dx, WORLD_WIDTH);
      const y = wrapCoord(anchor.y + dy, WORLD_HEIGHT);
      keys.push(tileKey(x, y));
    }
  }
  return keys;
};

/**
 * Tile keys currently covered by `ownerId`'s own active anchors only (no
 * cross-player resolution). This is the "am I currently defended here"
 * snapshot — pass only the anchors that are active *right now* (exclude any
 * destroyed/captured structure), since a dead anchor gives no defense.
 */
export const liveReachForOwner = (
  ownerId: string,
  activeAnchors: ReadonlyArray<ReachAnchor>
): Set<string> => {
  const set = new Set<string>();
  for (const anchor of activeAnchors) {
    if (anchor.ownerId !== ownerId) continue;
    for (const key of tileKeysInReach(anchor)) set.add(key);
  }
  return set;
};

export type OvertakenTile = { tileKey: string; fromOwnerId: string; toOwnerId: string };

/**
 * Applies activating `anchor` to the persistent border (`tileKey -> ownerId`).
 * For every tile in the anchor's disk:
 * - Unclaimed → granted outright to the anchor's owner.
 * - Already claimed by the same owner → no-op.
 * - Claimed by a different owner (contested) → the incoming anchor takes the
 *   tile only if the current claimant has **no currently-active anchor of
 *   their own still covering it**, per `defenderLiveReach(claimantOwnerId)`.
 *   If the claimant is still actively covering the tile, they keep it and
 *   the incoming anchor simply doesn't extend the border there.
 *
 * Pure — does not mutate `border`. Returns the updated map plus the list of
 * tiles that actually changed owner, so callers can drive the matching
 * `SETTLED -> FRONTIER` downgrade on exactly those tiles (only overtaken
 * tiles downgrade; the rest of a newly-granted disk over previously
 * unclaimed ground never downgrades anything, since nothing was settled
 * there under a different owner).
 */
export const grantAnchorToBorder = (
  border: ReadonlyMap<string, string>,
  anchor: ReachAnchor,
  defenderLiveReach: (claimantOwnerId: string) => ReadonlySet<string>
): { border: Map<string, string>; overtaken: OvertakenTile[] } => {
  const next = new Map(border);
  const overtaken: OvertakenTile[] = [];
  for (const key of tileKeysInReach(anchor)) {
    const existingOwner = next.get(key);
    if (!existingOwner) {
      next.set(key, anchor.ownerId);
      continue;
    }
    if (existingOwner === anchor.ownerId) continue;
    const defended = defenderLiveReach(existingOwner).has(key);
    if (!defended) {
      next.set(key, anchor.ownerId);
      overtaken.push({ tileKey: key, fromOwnerId: existingOwner, toOwnerId: anchor.ownerId });
    }
  }
  return { border: next, overtaken };
};

/**
 * Applies a deactivating `anchor` (structure destroyed, captured away, or
 * downgraded to FRONTIER) to the persistent border. By itself this changes
 * nothing — sticky territory, see the module doc comment — UNLESS some
 * OTHER (rival) player's anchors are, right now, already covering a tile
 * this anchor used to help defend and the border-owner can no longer defend
 * it themselves. In that specific case the tile transfers immediately,
 * rather than waiting for the rival to activate a brand-new anchor of their
 * own later — their existing coverage was simply never re-checked against
 * this border before, since the border previously only ever re-evaluated a
 * tile at anchor-ACTIVATION time.
 *
 * Only re-examines the tiles the deactivating anchor itself used to cover
 * (its own disk), and only tiles still owned in `border` by the SAME owner
 * the anchor belonged to — a tile that already changed hands for an
 * unrelated reason is left untouched.
 *
 * `ownerLiveReach` must be the anchor owner's live reach computed WITHOUT
 * the deactivated anchor (i.e. their remaining coverage right now).
 * `rivalLiveReachFor` is queried lazily, once per candidate rival, only for
 * tiles that actually need re-resolution. `rivalOwnerIds` should list every
 * other non-barbarian player to consider, in a deterministic order — the
 * first rival found covering a given tile wins it.
 *
 * Pure — does not mutate `border`. Returns the same shape as
 * `grantAnchorToBorder` so callers can drive the identical
 * `SETTLED -> FRONTIER` downgrade on exactly the returned `overtaken` tiles.
 */
export const reassessBorderOnAnchorDeactivation = (
  border: ReadonlyMap<string, string>,
  deactivatedAnchor: ReachAnchor,
  ownerLiveReach: ReadonlySet<string>,
  rivalLiveReachFor: (rivalOwnerId: string) => ReadonlySet<string>,
  rivalOwnerIds: ReadonlyArray<string>
): { border: Map<string, string>; overtaken: OvertakenTile[] } => {
  const next = new Map(border);
  const overtaken: OvertakenTile[] = [];
  for (const key of tileKeysInReach(deactivatedAnchor)) {
    if (next.get(key) !== deactivatedAnchor.ownerId) continue; // not (still) mine in the border
    if (ownerLiveReach.has(key)) continue; // still defended by another of my own anchors
    for (const rivalId of rivalOwnerIds) {
      if (rivalId === deactivatedAnchor.ownerId) continue;
      if (rivalLiveReachFor(rivalId).has(key)) {
        next.set(key, rivalId);
        overtaken.push({ tileKey: key, fromOwnerId: deactivatedAnchor.ownerId, toOwnerId: rivalId });
        break; // first rival wins ties, deterministic given caller's ordering
      }
    }
  }
  return { border: next, overtaken };
};

/**
 * Full reconciliation sweep over every currently SETTLED tile: if its owner
 * has no live reach coverage there AND some OTHER (non-barbarian) player's
 * live reach already covers it, the tile transfers (border ownership +
 * `overtaken` entry, same shape as grantAnchorToBorder/
 * reassessBorderOnAnchorDeactivation). Tiles nobody currently covers stay
 * exactly where they are — untouched, sticky, no change — matching the same
 * "no immediate downgrade from losing your own anchor in isolation" rule
 * every other reach function in this module follows.
 *
 * Unlike grantAnchorToBorder (scoped to one activating anchor's disk) or
 * reassessBorderOnAnchorDeactivation (scoped to one deactivating anchor's
 * disk), this walks every settled tile regardless of what `border` currently
 * says about it. That's specifically needed once, at process boot: a tile
 * whose defending anchor was lost *before* the deactivation-reassessment
 * mechanism existed will never get a DEACTIVATE event to react to
 * retroactively, and a border rebuilt from scratch on every restart
 * (`grantAnchorToBorder` only records a tile when *some* anchor's disk
 * actually reaches it) can silently drop a tile's border entry entirely —
 * with no `overtaken` event ever firing for it — if its own owner's anchor
 * no longer covers it. This sweep is the general safety net that catches
 * both cases. Not meant for a hot path — O(settled tiles).
 */
export const reconcileBorderAgainstLiveReach = (
  border: ReadonlyMap<string, string>,
  settledTiles: ReadonlyArray<{ tileKey: string; ownerId: string }>,
  anchors: ReadonlyArray<ReachAnchor>,
  ownerIds: ReadonlyArray<string>
): { border: Map<string, string>; overtaken: OvertakenTile[] } => {
  const next = new Map(border);
  const overtaken: OvertakenTile[] = [];
  const liveReachCache = new Map<string, ReadonlySet<string>>();
  const liveReachForOwnerCached = (ownerId: string): ReadonlySet<string> => {
    let set = liveReachCache.get(ownerId);
    if (!set) {
      set = liveReachForOwner(ownerId, anchors);
      liveReachCache.set(ownerId, set);
    }
    return set;
  };
  for (const { tileKey: key, ownerId } of settledTiles) {
    if (liveReachForOwnerCached(ownerId).has(key)) continue; // still defended by an anchor of their own
    for (const rivalId of ownerIds) {
      if (rivalId === ownerId) continue;
      if (liveReachForOwnerCached(rivalId).has(key)) {
        next.set(key, rivalId);
        overtaken.push({ tileKey: key, fromOwnerId: ownerId, toOwnerId: rivalId });
        break; // first rival in the given order wins, deterministic given caller's ordering
      }
    }
  }
  return { border: next, overtaken };
};

export type AnchorEvent =
  | { type: "ACTIVATE"; anchor: ReachAnchor }
  | { type: "DEACTIVATE"; anchor: ReachAnchor };

/**
 * Test/simulation harness: replays an ordered sequence of anchor
 * activate/deactivate events through `grantAnchorToBorder`, maintaining the
 * "currently active" anchor set needed for defense checks as it goes.
 * Deactivating an anchor never itself changes the border (sticky) — it only
 * changes what's available to defend against a *later* contest. Production
 * code doesn't need to replay history this way; it maintains the persistent
 * border as real state and calls `grantAnchorToBorder` once per activation
 * event as it happens, which is what this function does internally.
 */
export const applyAnchorEvents = (
  events: ReadonlyArray<AnchorEvent>
): { border: Map<string, string>; overtaken: OvertakenTile[] } => {
  let border = new Map<string, string>();
  const active: ReachAnchor[] = [];
  const allOvertaken: OvertakenTile[] = [];
  for (const event of events) {
    if (event.type === "ACTIVATE") {
      active.push(event.anchor);
      const result = grantAnchorToBorder(border, event.anchor, (ownerId) =>
        liveReachForOwner(ownerId, active)
      );
      border = result.border;
      allOvertaken.push(...result.overtaken);
    } else {
      const idx = active.indexOf(event.anchor);
      if (idx >= 0) active.splice(idx, 1);
    }
  }
  return { border, overtaken: allOvertaken };
};

/** Tile keys currently granted to a single player in the persistent border. */
export const reachSetForPlayer = (
  playerId: string,
  border: ReadonlyMap<string, string>
): Set<string> => {
  const set = new Set<string>();
  for (const [key, ownerId] of border) {
    if (ownerId === playerId) set.add(key);
  }
  return set;
};

export const isInReach = (
  playerId: string,
  x: number,
  y: number,
  border: ReadonlyMap<string, string>
): boolean => border.get(tileKey(wrapCoord(x, WORLD_WIDTH), wrapCoord(y, WORLD_HEIGHT))) === playerId;

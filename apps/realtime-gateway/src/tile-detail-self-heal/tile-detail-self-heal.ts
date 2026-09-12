// The first two rejection codes below signal a client ownership-belief desync --
// the client thought a tile was enemy-controlled (ATTACK) or unowned
// (EXPAND), and the sim's authoritative check disagreed. Pushing a fresh
// TILE_DELTA for the target tile lets #842's explicit ownerId/ownershipState
// nulling self-correct the client without the user manually re-pressing it.
//
// Deliberately excluded: LOCKED, NOT_OWNER, SHIELDED, ALLY_TARGET, BARRIER.
// Those reflect transient state (a pending command already claimed the
// target) or configuration/policy (ownership, shields, alliances, terrain
// barriers) rather than a stale ownership belief -- re-pushing tile detail
// would not change the outcome and would just be wasted work.
//
// MUSTER_INVALID is here for the same reason, one field over: the client only
// offers "Clear Muster" on a tile whose local state still carries a muster
// flag, so a rejection with "no muster on owned tile" means the client is
// holding a flag the sim already removed (e.g. the 2-day MUSTER_STALE_MS
// auto-clear landing while the player was offline). Pushing authoritative
// tile detail drops the phantom flag; see buildSnapshotTileDetail's
// musterJson comment for the omission that made the belief unrecoverable.
//
// COLLECT_EMPTY is the same story for shardSite: the tile menu only offers
// Collect Shard when the client's local tile still carries one, so "no shard
// present" means the client (or the gateway's own cached snapshot) is
// holding a shard the sim already cleared -- most commonly a shard-rain site
// that expired while the tile was outside this player's live vision. See
// tile-detail-snapshot.ts's shardSiteJson comment and
// tile-detail-merge.ts's mergeTileDetailIntoSnapshot for the two halves of
// the fix this self-heals on top of.
const SELF_HEAL_REJECTION_CODES: ReadonlySet<string> = new Set([
  "ATTACK_TARGET_INVALID",
  "EXPAND_TARGET_OWNED",
  "MUSTER_INVALID",
  "COLLECT_EMPTY"
]);

export const isSelfHealRejectionCode = (code: string): boolean => SELF_HEAL_REJECTION_CODES.has(code);

export type SelfHealTarget = { x: number; y: number };

export const selfHealTargetFromRejection = (code: string, payloadJson: string): SelfHealTarget | undefined => {
  if (!isSelfHealRejectionCode(code)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  // ATTACK/EXPAND payloads name their target as toX/toY; the muster commands
  // (SET_MUSTER / CLEAR_MUSTER / UPGRADE_MUSTER_CAP) address the flag tile as
  // plain x/y. Accept either shape, preferring toX/toY when both are present.
  const source = parsed as { toX?: unknown; toY?: unknown; x?: unknown; y?: unknown };
  const rawX = typeof source.toX === "number" ? source.toX : source.x;
  const rawY = typeof source.toY === "number" ? source.toY : source.y;
  if (typeof rawX !== "number" || !Number.isFinite(rawX)) return undefined;
  if (typeof rawY !== "number" || !Number.isFinite(rawY)) return undefined;
  return { x: rawX, y: rawY };
};

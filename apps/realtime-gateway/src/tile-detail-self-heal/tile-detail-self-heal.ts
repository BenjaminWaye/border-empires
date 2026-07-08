// The two rejection codes below signal a client ownership-belief desync --
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
const SELF_HEAL_REJECTION_CODES: ReadonlySet<string> = new Set(["ATTACK_TARGET_INVALID", "EXPAND_TARGET_OWNED"]);

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
  const toX = (parsed as { toX?: unknown }).toX;
  const toY = (parsed as { toY?: unknown }).toY;
  if (typeof toX !== "number" || !Number.isFinite(toX)) return undefined;
  if (typeof toY !== "number" || !Number.isFinite(toY)) return undefined;
  return { x: toX, y: toY };
};

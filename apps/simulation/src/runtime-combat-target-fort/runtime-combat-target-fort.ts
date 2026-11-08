import type { DomainTileState } from "@border-empires/game-domain";
import { isCaptureHoldActive, isFortDefending } from "@border-empires/shared";

// Narrow slice of RuntimeCombatSupportContext (runtime-combat-support.ts) the
// fort check needs; kept structural so this module doesn't import back.
export type TargetFortContext = {
  now: () => number;
  isStructureDormant: (playerId: string, tileKey: string, field: "fort") => boolean;
};

// Whether the target's fort actually grants its combat bonus: active,
// owned by the defender, and not resource-dormant (§5.4). Shared between
// resolveAttackCombat (combat-power calculation) and
// buildLockedCombatResolution (manpower-loss-range lookup) so the two
// can't drift on what counts as "has an active fort" for the same attack.
export const targetHasActiveFortFor = (
  ctx: TargetFortContext,
  previousTarget: DomainTileState | undefined,
  defenderOwnerId: string | undefined,
  targetKey: string
): boolean =>
  Boolean(
    previousTarget?.fort &&
      isFortDefending(previousTarget.fort) &&
      // A just-captured fort is rubble while the capturing troops hold the
      // tile (capture-hold.ts): no fort-tier floor, no fort terms either side.
      !isCaptureHoldActive(previousTarget, ctx.now()) &&
      previousTarget.fort.ownerId === defenderOwnerId &&
      defenderOwnerId &&
      !ctx.isStructureDormant(defenderOwnerId, targetKey, "fort")
  );

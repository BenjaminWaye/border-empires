import type { DomainTileState } from "@border-empires/game-domain";
import { fortPerimeterSourceVariant, isCaptureHoldActive, isFortDefending, isTownBesieged, type FortVariant } from "@border-empires/shared";

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

// Fort perimeter (fort-perimeter.ts): the strongest of the defender's own
// forts whose perimeter covers the target. Same usability rules as the
// target's own fort above: not dormant, not rubble under a capture hold.
export const targetFortPerimeterVariantFor = (
  ctx: TargetFortContext & { tiles: ReadonlyMap<string, DomainTileState> },
  previousTarget: DomainTileState | undefined,
  defenderOwnerId: string | undefined
): FortVariant | undefined => {
  if (!previousTarget || !defenderOwnerId || previousTarget.ownershipState !== "SETTLED") return undefined;
  const nowMs = ctx.now();
  return fortPerimeterSourceVariant(
    defenderOwnerId,
    previousTarget.x,
    previousTarget.y,
    (x, y) => ctx.tiles.get(`${x},${y}`),
    nowMs,
    (x, y) => {
      const fortTile = ctx.tiles.get(`${x},${y}`);
      return Boolean(fortTile) && !isCaptureHoldActive(fortTile!, nowMs) && !ctx.isStructureDormant(defenderOwnerId, `${x},${y}`, "fort");
    }
  );
};

// Siege (town-siege.ts): the defender's town has no garrisoned plot of its
// own around it and a rival holds one. Read from the live tile map at roll
// time, the same rule the gateway preview and client paint apply.
export const targetTownBesiegedFor = (
  ctx: { tiles: ReadonlyMap<string, DomainTileState> },
  previousTarget: DomainTileState | undefined,
  defenderOwnerId: string | undefined
): boolean =>
  Boolean(previousTarget?.town && defenderOwnerId && previousTarget.ownerId === defenderOwnerId) &&
  isTownBesieged(previousTarget!, (x, y) => ctx.tiles.get(`${x},${y}`));

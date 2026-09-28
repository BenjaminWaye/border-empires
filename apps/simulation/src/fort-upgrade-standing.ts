import type { DomainTileState } from "@border-empires/game-domain";

type TileFort = NonNullable<DomainTileState["fort"]>;

// What's left of a fort-family construction once the construction itself is
// lost (cancelled, captured, abandoned): a fresh build leaves nothing, while
// an upgrade leaves the tier it was upgrading from, which stood (and defended)
// the whole time.
export const standingFortAfterLostUpgrade = (
  fort: TileFort,
  ownerId: string = fort.ownerId,
  activatedAt: number | undefined = fort.activatedAt
): TileFort | undefined => {
  if (fort.status !== "under_construction" || !fort.upgradingFrom) return undefined;
  return {
    ownerId,
    status: "active",
    variant: fort.upgradingFrom,
    ...(activatedAt !== undefined ? { activatedAt } : {}),
    ...(fort.disabledUntil !== undefined ? { disabledUntil: fort.disabledUntil } : {})
  };
};

// The House Charges outcome recorded on the season when its winner is crowned
// (docs/house-charges-plan.md, "Holding to game end and scoring"): every
// House's kept charges, whether each was held at that moment, and for how
// long. Read from the held state the ticker keeps on each player (at most one
// tick old), so crowning needs no tile scan.
import {
  houseChargeTitle,
  keptHouseCharges,
  type HouseChargesState,
  type SeasonHouseChargesSnapshot
} from "@border-empires/shared";

const HOUR_MS = 60 * 60 * 1000;

export type CrowningChargePlayer = { readonly id: string; readonly name?: string | undefined; readonly houseCharges?: HouseChargesState | undefined };

export const houseChargesAtCrowning = (players: Iterable<CrowningChargePlayer>, crownedAt: number): SeasonHouseChargesSnapshot[] => {
  const results: SeasonHouseChargesSnapshot[] = [];
  for (const player of players) {
    const state = player.houseCharges;
    if (!state) continue;
    const charges = keptHouseCharges(state).map((charge) => {
      const since = state.completeSince?.[charge.id];
      const held = since !== undefined;
      return {
        id: charge.id,
        kind: charge.kind,
        title: houseChargeTitle(charge),
        rarity: charge.rarity,
        renown: charge.renown,
        held,
        hoursHeld: held ? Math.max(0, Math.floor((crownedAt - since) / HOUR_MS)) : 0,
        size: state.sizes?.[charge.id] ?? 0
      };
    });
    if (charges.length === 0) continue;
    results.push({ playerId: player.id, playerName: player.name ?? player.id, charges });
  }
  return results.sort((a, b) => a.playerId.localeCompare(b.playerId));
};

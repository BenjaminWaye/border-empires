/**
 * Bonus links between AFC picks. Tiers mix branches freely, so no upgrade may
 * require an earlier pick to work: a link only ever adds to an upgrade that is
 * complete on its own. The picker shows each link on the later upgrade's card.
 */
export interface AfcSynergy { readonly upgradeId: string; readonly withId: string; readonly text: string }
export const AFC_SYNERGIES: readonly AfcSynergy[] = [
  { upgradeId: "afc-vanguard-3", withId: "afc-vanguard-2", text: "Faster fights build stacks sooner." },
  { upgradeId: "afc-vanguard-5", withId: "afc-vanguard-3", text: "A flag at full Momentum forces 2 tiles to surrender instead of 1." },
  { upgradeId: "afc-dominion-5", withId: "afc-dominion-1", text: "Relay Beacons cost one-sixth of the usual manpower." },
  { upgradeId: "afc-exchequer-5", withId: "afc-exchequer-1", text: "The same core towns earn +200% Coin in total." },
  { upgradeId: "afc-oracle-5", withId: "afc-oracle-4", text: "Counterphase opens towers that still have shots." },
  { upgradeId: "afc-chancery-4", withId: "afc-chancery-1", text: "A forced armistice pays Envoy income like any other truce." }
];
export const afcSynergiesFor = (upgradeId: string): readonly AfcSynergy[] => AFC_SYNERGIES.filter(link => link.upgradeId === upgradeId);

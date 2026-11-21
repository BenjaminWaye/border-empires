import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { houseChargeDomainWeight, houseChargeRarityForPips, type SeasonHouseChargesSnapshot } from "@border-empires/shared";
import { stipendPayoutAmounts } from "../galaxy-stipend-payout/galaxy-stipend-payout.js";
import { chargeDomainWeightByAuthUid } from "./galaxy-house-charge-rewards.js";

type Spec = [held: boolean, pips?: number];
let nextId = 0;
const charge = ([held, pips = 1]: Spec) => ({ id: `c${(nextId += 1)}`, kind: "CHARTER" as const, title: "Road", rarity: houseChargeRarityForPips(pips), renown: pips, difficultyScored: true as const, held, hoursHeld: held ? 5 : 0, size: 3 });
const [COMMON, RARE, MYTHIC] = [1, 3, 4];
const houses = (entries: Array<[string, Spec[]]>): SeasonHouseChargesSnapshot[] =>
  entries.map(([playerId, specs]) => ({ playerId, playerName: playerId, charges: specs.map(charge) }));
const binding = (uidByPlayer: Record<string, string>) =>
  ({ getByPlayerId: async (playerId: string) => (uidByPlayer[playerId] ? { uid: uidByPlayer[playerId] } : undefined) }) as never;

describe("House Charges galaxy reward", () => {
  it("pays a Stipend its progress Influence only; charges add no Influence", () => {
    expect(stipendPayoutAmounts({ influence: 6.4 })).toEqual({ influence: 6 });
  });

  it("pays one Domain per difficulty pip, whatever the rarity label, and nothing unless held", () => {
    expect([1, 2, 3, 4].map((renown) => houseChargeDomainWeight({ held: true, renown, rarity: "COMMON", difficultyScored: true }))).toEqual([1, 2, 3, 4]);
    expect(houseChargeDomainWeight({ held: false, renown: 4, rarity: "MYTHIC", difficultyScored: true })).toBe(0);
    expect([1, 2, 3, 4].map(houseChargeRarityForPips)).toEqual(["COMMON", "COMMON", "RARE", "MYTHIC"]);
  });

  // Review of #2897: charges dealt before difficulty scoring keep the pay they were dealt with, so archived
  // seasons are not repriced and an old 3-pip tundra does not jump to +3.
  it("pays a charge dealt before difficulty scoring by its stored rarity", () => {
    expect(houseChargeDomainWeight({ held: true, rarity: "RARE", renown: 3 })).toBe(2);
    expect(houseChargeDomainWeight({ held: true, rarity: "COMMON", renown: 2 })).toBe(1);
    expect(houseChargeDomainWeight({ held: true, rarity: "MYTHIC", renown: 4 })).toBe(4);
  });

  it("banks Domain score per bound account across crowned seasons, including Stipend players, skipping unbound players", async () => {
    const archives = [
      {
        seasonId: "s1",
        houseCharges: houses([["p1", [[true], [false, MYTHIC]]], ["ai-1", [[true], [true]]], ["p3", [[true, RARE], [true]]]]),
        galaxyTiers: [{ playerId: "p3", playerName: "p3", tier: "STIPEND", influence: 4 }]
      },
      { seasonId: "s2", houseCharges: houses([["p1", [[true, MYTHIC], [true]]], ["p2", [[false], [false]]]]) },
      { seasonId: "s0" }
    ] as unknown as SeasonArchiveRow[];
    const current = { seasonId: "s3", status: "ended", seasonHouseCharges: houses([["p2", [[true, RARE]]]]) } as unknown as CurrentSeasonSummary;
    const weights = await chargeDomainWeightByAuthUid({
      listSeasonArchives: async () => archives,
      getCurrentSeasonSummary: async () => current,
      authBindingStore: binding({ p1: "uid-1", p2: "uid-2", p3: "uid-3" })
    });
    // p3 was paid a Stipend in s1 and still banks its charges (it no longer gets Influence for them).
    expect(Object.fromEntries(weights)).toEqual({ "uid-1": COMMON + MYTHIC + COMMON, "uid-3": RARE + COMMON, "uid-2": RARE });
  });

  it("counts an ended current season once even after it is archived", async () => {
    const charges = houses([["p1", [[true, RARE]]]]);
    const weights = await chargeDomainWeightByAuthUid({
      listSeasonArchives: async () => [{ seasonId: "s3", houseCharges: charges }] as unknown as SeasonArchiveRow[],
      getCurrentSeasonSummary: async () => ({ seasonId: "s3", status: "ended", seasonHouseCharges: charges }) as unknown as CurrentSeasonSummary,
      authBindingStore: binding({ p1: "uid-1" })
    });
    expect(weights.get("uid-1")).toBe(RARE);
  });

  it("ignores a season still in play", async () => {
    const weights = await chargeDomainWeightByAuthUid({
      listSeasonArchives: async () => [],
      getCurrentSeasonSummary: async () => ({ seasonId: "s3", status: "active", seasonHouseCharges: houses([["p1", [[true]]]]) }) as unknown as CurrentSeasonSummary,
      authBindingStore: binding({ p1: "uid-1" })
    });
    expect(weights.size).toBe(0);
  });
});

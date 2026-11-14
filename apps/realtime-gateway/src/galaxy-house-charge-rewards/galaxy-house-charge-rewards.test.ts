import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { HOUSE_CHARGE_STIPEND_INFLUENCE, type SeasonHouseChargesSnapshot } from "@border-empires/shared";
import { stipendPayoutAmounts } from "../galaxy-stipend-payout/galaxy-stipend-payout.js";
import { heldChargeCountsByAuthUid } from "./galaxy-house-charge-rewards.js";

const charge = (held: boolean) => ({ id: `c${Math.random()}`, kind: "SEAT" as const, title: "Seat of Vell", rarity: "COMMON" as const, renown: 1, held, hoursHeld: held ? 5 : 0, size: 3 });
const houses = (entries: Array<[string, boolean[]]>): SeasonHouseChargesSnapshot[] =>
  entries.map(([playerId, held]) => ({ playerId, playerName: playerId, charges: held.map(charge) }));

describe("House Charges galaxy reward", () => {
  it("adds Influence to a Stipend per charge held at that crowning", () => {
    expect(stipendPayoutAmounts({ influence: 6.4 })).toEqual({ influence: 6 });
    expect(stipendPayoutAmounts({ influence: 6.4 }, 2)).toEqual({ influence: 6 + 2 * HOUSE_CHARGE_STIPEND_INFLUENCE });
  });

  it("sums held charges per bound account across crowned seasons, skipping unbound players", async () => {
    const archives = [
      { seasonId: "s1", houseCharges: houses([["p1", [true, false]], ["ai-1", [true, true]]]) },
      { seasonId: "s2", houseCharges: houses([["p1", [true, true]], ["p2", [false, false]]]) },
      { seasonId: "s0" }
    ] as unknown as SeasonArchiveRow[];
    const current = { seasonId: "s3", status: "ended", seasonHouseCharges: houses([["p2", [true]]]) } as unknown as CurrentSeasonSummary;
    const uidByPlayer: Record<string, string> = { p1: "uid-1", p2: "uid-2" };
    const counts = await heldChargeCountsByAuthUid({
      listSeasonArchives: async () => archives,
      getCurrentSeasonSummary: async () => current,
      authBindingStore: { getByPlayerId: async (playerId: string) => (uidByPlayer[playerId] ? { uid: uidByPlayer[playerId] } : undefined) } as never
    });
    expect([...counts]).toEqual([["uid-1", 3], ["uid-2", 1]]);
  });

  it("ignores a season still in play", async () => {
    const counts = await heldChargeCountsByAuthUid({
      listSeasonArchives: async () => [],
      getCurrentSeasonSummary: async () => ({ seasonId: "s3", status: "active", seasonHouseCharges: houses([["p1", [true]]]) }) as unknown as CurrentSeasonSummary,
      authBindingStore: { getByPlayerId: async () => ({ uid: "uid-1" }) } as never
    });
    expect(counts.size).toBe(0);
  });
});

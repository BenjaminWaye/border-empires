import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_CHARGE_REFILL_MS, SCOUT_DRONE_MAX_CHARGES } from "@border-empires/shared";
import { createScoutChargeLedger } from "./scout-drone-charge-ledger.js";

const playersWith = () => {
  const players = new Map<string, { scoutChargeSpends?: number[] }>([["me", {}]]);
  return { players, ledger: createScoutChargeLedger(() => players) };
};

describe("scout charge ledger", () => {
  it("spends charges on the player record and refills each one after the refill time", () => {
    const { players, ledger } = playersWith();
    expect(ledger.available("me", 0)).toBe(SCOUT_DRONE_MAX_CHARGES);
    ledger.spend("me", 3, 1_000);
    ledger.spend("me", 2, 5_000);
    expect(players.get("me")!.scoutChargeSpends).toEqual([1_000, 1_000, 1_000, 5_000, 5_000]);
    expect(ledger.available("me", 5_000)).toBe(SCOUT_DRONE_MAX_CHARGES - 5);
    expect(ledger.wire("me", 5_000)).toEqual({ max: SCOUT_DRONE_MAX_CHARGES, refillMs: SCOUT_DRONE_CHARGE_REFILL_MS, usedAt: [1_000, 1_000, 1_000, 5_000, 5_000] });
    expect(ledger.available("me", 1_000 + SCOUT_DRONE_CHARGE_REFILL_MS)).toBe(SCOUT_DRONE_MAX_CHARGES - 2);
    expect(players.get("me")!.scoutChargeSpends).toEqual([5_000, 5_000]);
    expect(ledger.available("me", 5_000 + SCOUT_DRONE_CHARGE_REFILL_MS)).toBe(SCOUT_DRONE_MAX_CHARGES);
    expect(players.get("me")!.scoutChargeSpends).toBeUndefined();
  });

  it("keeps what a restart restores: spends already on the player count", () => {
    const players = new Map([["me", { scoutChargeSpends: [100, 200] }]]);
    expect(createScoutChargeLedger(() => players).available("me", 300)).toBe(SCOUT_DRONE_MAX_CHARGES - 2);
  });

  it("gives back the most recent spends on refund, and never more than were spent", () => {
    const { players, ledger } = playersWith();
    ledger.spend("me", 1, 1_000);
    ledger.spend("me", 3, 2_000);
    ledger.refund("me", 2, 2_500);
    expect(players.get("me")!.scoutChargeSpends).toEqual([1_000, 2_000]);
    ledger.refund("me", 5, 2_500);
    expect(players.get("me")!.scoutChargeSpends).toBeUndefined();
    expect(ledger.available("me", 2_500)).toBe(SCOUT_DRONE_MAX_CHARGES);
  });

  it("never keeps more spends than charges", () => {
    const { players, ledger } = playersWith();
    ledger.spend("me", 20, 0);
    expect(players.get("me")!.scoutChargeSpends).toHaveLength(SCOUT_DRONE_MAX_CHARGES);
  });
});

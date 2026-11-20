import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_CHARGE_REFILL_MS, SCOUT_DRONE_MAX_CHARGES } from "@border-empires/shared";
import { createScoutChargeLedger } from "./scout-drone-charge-ledger.js";

describe("scout charge ledger", () => {
  it("spends charges and refills each one after the refill time", () => {
    const ledger = createScoutChargeLedger();
    expect(ledger.available("me", 0)).toBe(SCOUT_DRONE_MAX_CHARGES);
    ledger.spend("me", 3, 1_000);
    ledger.spend("me", 2, 5_000);
    expect(ledger.available("me", 5_000)).toBe(SCOUT_DRONE_MAX_CHARGES - 5);
    expect(ledger.wire("me", 5_000)).toEqual({ max: SCOUT_DRONE_MAX_CHARGES, refillMs: SCOUT_DRONE_CHARGE_REFILL_MS, usedAt: [1_000, 1_000, 1_000, 5_000, 5_000] });
    expect(ledger.available("me", 1_000 + SCOUT_DRONE_CHARGE_REFILL_MS)).toBe(SCOUT_DRONE_MAX_CHARGES - 2);
    ledger.prune(5_000 + SCOUT_DRONE_CHARGE_REFILL_MS);
    expect(ledger.size()).toBe(0);
    expect(ledger.available("me", 5_000 + SCOUT_DRONE_CHARGE_REFILL_MS)).toBe(SCOUT_DRONE_MAX_CHARGES);
  });

  it("prunes only refilled spends and keeps the rest", () => {
    const ledger = createScoutChargeLedger();
    ledger.spend("me", 1, 0);
    ledger.spend("me", 1, 10_000);
    ledger.prune(SCOUT_DRONE_CHARGE_REFILL_MS);
    expect(ledger.size()).toBe(1);
    expect(ledger.wire("me", SCOUT_DRONE_CHARGE_REFILL_MS).usedAt).toEqual([10_000]);
  });

  it("evicts the oldest player at the cap and counts it", () => {
    const ledger = createScoutChargeLedger(2);
    ledger.spend("a", 1, 0);
    ledger.spend("b", 1, 0);
    ledger.spend("c", 1, 0);
    expect(ledger.size()).toBe(2);
    expect(ledger.evictions()).toBe(1);
    expect(ledger.available("a", 0)).toBe(SCOUT_DRONE_MAX_CHARGES);
  });
});

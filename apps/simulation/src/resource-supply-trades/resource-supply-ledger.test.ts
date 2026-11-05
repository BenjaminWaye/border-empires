import { describe, expect, it, vi } from "vitest";
import { ResourceSupplyLedger, type ResourceSupplyLedgerContext } from "./resource-supply-ledger.js";
import type { ResourceSupplyAgreement } from "@border-empires/shared";
const row = (id = "deal"): ResourceSupplyAgreement => ({ id, proposerId: "a", targetId: "b", proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 1, expiresAt: 100 });
const context = (): ResourceSupplyLedgerContext => ({
  capacityFor: id => id === "a" ? { FOOD: 20 } : {}, beforeChange: vi.fn(), invalidate: vi.fn(), changed: vi.fn()
});
describe("resource supply ledger", () => {
  it("enforces per-player agreement bounds and restores active state", () => {
    const ledger = new ResourceSupplyLedger(context());
    for (let i = 0; i < 16; i += 1) expect(ledger.add(row(String(i)), 10).ok).toBe(true);
    expect(ledger.add(row("overflow"), 10).ok).toBe(false);
    expect(new ResourceSupplyLedger(context(), JSON.parse(JSON.stringify(ledger.rows()))).size).toBe(16);
  });
  it("settles expiry at the exact deadline with old supply still visible to the settlement callback", () => {
    let now = 10;
    let ledger: ResourceSupplyLedger;
    const observed: number[] = [];
    const ctx: ResourceSupplyLedgerContext = { ...context(), beforeChange: (at) => {
      observed.push(at); observed.push(ledger.allocation(now).flows.get("b")!.incoming.FOOD);
    } };
    ledger = new ResourceSupplyLedger(ctx, [row()]);
    now = 150;
    expect(ledger.allocation(now).flows.size).toBe(0);
    expect(observed).toEqual([100, 1]);
    expect(ctx.changed).toHaveBeenCalledWith("expired", expect.objectContaining({ id: "deal" }));
  });
  it("cancels a settled agreement without creating an inverse contract", () => {
    const ctx = context(), ledger = new ResourceSupplyLedger(ctx, [row()]);
    expect(ledger.remove("deal", 50)).toBe(true);
    expect(ledger.remove("deal", 50)).toBe(false);
    expect(ledger.rows()).toEqual([]);
    expect(ctx.changed).toHaveBeenCalledWith("cancelled", expect.objectContaining({ id: "deal" }));
  });
  it("settles only Houses connected to the changing contract", () => {
    const ctx = context(), ledger = new ResourceSupplyLedger(ctx, [row("ab"), {
      ...row("cd"), proposerId: "c", targetId: "d"
    }]);
    expect(ledger.affectedParticipantIds(["a"])).toEqual(["a", "b"]);
    expect(ledger.remove("ab", 50)).toBe(true);
    expect(ctx.beforeChange).toHaveBeenCalledWith(50, ["a", "b"]);
    expect(ledger.rows().map(entry => entry.id)).toEqual(["cd"]);
  });

});

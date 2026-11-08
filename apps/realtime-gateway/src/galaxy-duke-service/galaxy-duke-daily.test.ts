// The daily rhythm at the service level (§30): one order per system and one
// decree per Duke, each spent only on success and ready again a day later.
import { describe, expect, it } from "vitest";

import { DAY, T0, harness, withSystem } from "./galaxy-duke-test-harness.js";

const giveInfluence = (h: Awaited<ReturnType<typeof harness>>, influence: number) =>
  h.stores.galaxyEconomyStore.upsertBalance({ authUid: "uid-a", influence, production: 0, lastCycleAt: T0 });

describe("orders: one per system per day", () => {
  it("a second build, a launch or a Fortify in the same system waits a day; another system is unaffected", async () => {
    const h = await harness([{ seasonId: "season-a", player: "a" }, { seasonId: "season-c", player: "a" }, { seasonId: "season-b", player: "b" }]);
    await h.service.status("uid-a");
    expect((await h.service.build("uid-a", "season-a", { kind: "FIGHTER" })).ok).toBe(true);
    expect((await h.service.cancelBuild("uid-a", "season-a")).ok).toBe(true);
    // Cancelling frees the slot but not the order.
    expect(await h.service.build("uid-a", "season-a", { kind: "PROBE" })).toMatchObject({ ok: false, code: "ORDER_NOT_READY", availableAt: T0 + DAY });
    await h.patch("uid-a", withSystem("season-a", { probeStock: 1 }));
    expect(await h.service.order("uid-a", "season-a", { kind: "PROBE", targetSeasonId: "season-b" })).toMatchObject({ ok: false, code: "ORDER_NOT_READY" });
    await h.stores.galaxyEconomyStore.setStability("uid-a", "season-a", 50);
    expect(await h.service.fortify("uid-a", "season-a")).toMatchObject({ ok: false, code: "ORDER_NOT_READY" });
    expect((await h.service.build("uid-a", "season-c", { kind: "FIGHTER" })).ok).toBe(true);
    h.advance(DAY);
    expect((await h.service.order("uid-a", "season-a", { kind: "PROBE", targetSeasonId: "season-b" })).ok).toBe(true);
  });

  it("Fortify adds 15 Stability at once and spends the order; a refused Fortify spends nothing", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    expect(await h.service.fortify("uid-a", "season-a")).toMatchObject({ ok: false, code: "ALREADY_STABLE" });
    await h.stores.galaxyEconomyStore.setStability("uid-a", "season-a", 50);
    expect((await h.service.fortify("uid-a", "season-a")).ok).toBe(true);
    expect(await h.stability("uid-a", "season-a")).toBe(65);
    expect((await h.service.status("uid-a"))?.systems[0]?.order).toEqual({ ready: false, readyAt: T0 + DAY });
  });
});

describe("decrees: one per Duke per day", () => {
  it("Hold Court pays 1 Influence and spends the decree", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    await giveInfluence(h, 3);
    expect((await h.service.holdCourt("uid-a")).ok).toBe(true);
    expect((await h.stores.galaxyEconomyStore.getBalance("uid-a"))?.influence).toBe(4);
    expect(await h.service.holdCourt("uid-a")).toMatchObject({ ok: false, code: "DECREE_NOT_READY" });
  });

  it("the decree is saved before its effect, so a failure midway can never be retried for free", async () => {
    const h = await harness();
    await h.service.status("uid-a");
    const upsert = h.stores.galaxyEconomyStore.upsertBalance.bind(h.stores.galaxyEconomyStore);
    h.stores.galaxyEconomyStore.upsertBalance = async () => {
      throw new Error("store down");
    };
    await expect(h.service.holdCourt("uid-a")).rejects.toThrow("store down");
    h.stores.galaxyEconomyStore.upsertBalance = upsert;
    expect(await h.service.holdCourt("uid-a")).toMatchObject({ ok: false, code: "DECREE_NOT_READY" });
  });
});

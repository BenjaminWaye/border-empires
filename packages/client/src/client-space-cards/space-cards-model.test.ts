import { describe, expect, it } from "vitest";
import { D, H, NOW, dukeStatus, dukeSystem } from "../client-duke-panel/client-duke-fixtures.js";
import type { DukePoliticsView } from "../client-duke-panel/client-duke-types.js";
import { decreeCards, nextStop, orderCards } from "./space-cards-model.js";

const politics = (patch: Partial<DukePoliticsView> = {}): DukePoliticsView => ({
  renown: 0,
  grievance: null,
  grievancesAgainstMe: [],
  writ: null,
  favor: { revoked: false, runawaySince: null },
  lent: [],
  rivals: [{ seasonId: "kel", label: "House Sigrid", weight: 40, revoked: false, grievanceCost: 5, isAi: true }],
  ...patch
});

describe("decree cards (galaxy view)", () => {
  it("always offers Hold Court, plus a wager and a grievance on the leader", () => {
    const cards = decreeCards(dukeStatus({ politics: politics() }), NOW);
    expect(cards.map((c) => c.id)).toEqual(["declare:kel", "wager", "hold"]);
    expect(cards.find((c) => c.id === "hold")).toMatchObject({ gain: "1 Influence", cost: "Nothing", disabledReason: null });
    expect(cards.find((c) => c.id === "wager")).toMatchObject({ cost: "10 Influence", gain: "2 Domain" });
  });
  it("says when the next decree comes once today's is used, on every decree card", () => {
    const cards = decreeCards(dukeStatus({ politics: politics(), decree: { ready: false, readyAt: NOW + 5 * H } }), NOW);
    expect(cards.every((c) => c.disabledReason === "Next decree in 5h")).toBe(true);
  });
  it("puts the free answers (the Court's offer, a Writ) first, and they stay playable", () => {
    const writ = { kind: "STRIKE" as const, expiresAt: NOW + D, targetLabel: "Kel" };
    const status = dukeStatus({ politics: politics({ writ }), decree: { ready: false, readyAt: NOW + H }, court: { ...dukeStatus().court, offer: { status: "PENDING", protectedUntil: null, moveLockedUntil: null } } });
    const [offer, w] = decreeCards(status, NOW);
    expect(offer).toMatchObject({ id: "offer", free: true, disabledReason: null, alt: { verb: "Decline" } });
    expect(w).toMatchObject({ id: "writ", title: "Writ: raid Kel", free: true, disabledReason: null });
  });
  it("offers to lend a Fighter first when the Court has turned a blind eye", () => {
    const status = dukeStatus({ systems: [dukeSystem({ fighters: [100] })], politics: politics({ favor: { revoked: true, runawaySince: NOW - 8 * D } }) });
    expect(decreeCards(status, NOW)[0]).toMatchObject({ id: "lend", urgent: true, action: { kind: "LEND", fromSeasonId: "s1" } });
  });
});

describe("order cards (a system's view)", () => {
  it("puts Defend first when craft are coming and nothing guards the system", () => {
    const cards = orderCards(dukeStatus(), "s1", NOW);
    expect(cards[0]).toMatchObject({ id: "fighter", title: "Defend Aurelia", urgent: true, badge: "2d", cost: "8h" });
  });
  it("offers Fortify (+15 now) when Stability is down, and raids on scouted rivals once a Fighter is home", () => {
    const status = dukeStatus({
      systems: [dukeSystem({ fighters: [100], incursionArrivesAt: null })],
      intel: [{ seasonId: "kel", label: "Kel", stability: 60, defenderHull: null, at: NOW, live: true }],
      politics: politics()
    });
    const ids = orderCards(status, "s1", NOW).map((c) => c.id);
    expect(ids).toContain("fortify");
    expect(ids).toContain("raid:kel");
  });
  it("shows every order card as waiting once today's order is spent", () => {
    const status = dukeStatus({ systems: [dukeSystem({ order: { ready: false, readyAt: NOW + 3 * H } })] });
    expect(orderCards(status, "s1", NOW).every((c) => c.disabledReason === "Next order in 3h")).toBe(true);
  });
  it("never shows more than five cards", () => {
    expect(orderCards(dukeStatus({ politics: politics() }), "s1", NOW).length).toBeLessThanOrEqual(5);
  });
});

describe("nextStop: where the view goes after an action", () => {
  const two = dukeStatus({ systems: [dukeSystem(), dukeSystem({ seasonId: "s2", label: "Vesk" })] });
  it("after a decree, to the first system with an order ready", () => {
    expect(nextStop(two, { mode: "galaxy" })).toEqual({ mode: "system", seasonId: "s1" });
  });
  it("after an order, to the next system with one ready, then back to the galaxy", () => {
    expect(nextStop(two, { mode: "system", seasonId: "s1" })).toEqual({ mode: "system", seasonId: "s2" });
    const spent = dukeStatus({ systems: [dukeSystem({ order: { ready: false, readyAt: NOW + H } }), dukeSystem({ seasonId: "s2", order: { ready: false, readyAt: NOW + H } })] });
    expect(nextStop(spent, { mode: "system", seasonId: "s2" })).toEqual({ mode: "galaxy" });
  });
});

describe("hand order", () => {
  it("puts an urgent card ahead of a free answer, so a phone always shows it first", () => {
    const writ = { kind: "FIGHTER" as const, expiresAt: NOW + D, targetLabel: null };
    const ids = orderCards(dukeStatus({ politics: politics({ writ }) }), "s1", NOW).map((c) => c.id);
    expect(ids.slice(0, 2)).toEqual(["fighter", "writ"]);
  });
});

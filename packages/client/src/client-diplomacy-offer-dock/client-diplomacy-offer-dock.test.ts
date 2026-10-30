import { describe, expect, it } from "vitest";

import { formatOfferCountdown, OFFER_DOCK_MAX_ROWS, offerDockEntries, offerDockHtml, offerDockMessage } from "./client-diplomacy-offer-dock.js";

const truce = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  fromPlayerId: `from-${id}`,
  toPlayerId: "me",
  createdAt: 1_000,
  expiresAt: 301_000,
  durationHours: 12 as const,
  fromName: "Tove",
  ...overrides
});

const state = (truces: ReturnType<typeof truce>[], alliances: Array<{ id: string; fromPlayerId: string; toPlayerId: string; createdAt: number; fromName?: string }> = []) => ({
  me: "me",
  incomingTruceRequests: truces,
  incomingAllianceRequests: alliances
});

describe("diplomacy offer dock", () => {
  it("without a server clock, counts an offer's lifetime from when this client first saw it, not the device clock", () => {
    const seen = new Map<string, number>();
    const unsynced = (): undefined => undefined;
    // Device clock far ahead of the server's: comparing expiresAt with now would hide the offer at once.
    const [first] = offerDockEntries(state([truce("t1")]), seen, new Set(), 9_000_000, unsynced);
    expect(first?.remainingMs).toBe(300_000);
    const [later] = offerDockEntries(state([truce("t1")]), seen, new Set(), 9_060_000, unsynced);
    expect(later?.remainingMs).toBe(240_000);
    expect(offerDockEntries(state([truce("t1")]), seen, new Set(), 9_300_000, unsynced)).toEqual([]);
  });

  // Regression: an offer first seen after a reload showed its full 5:00 again
  // and then vanished mid-countdown when the server dropped it.
  it("with a server clock, shows the time actually left on an offer first seen late", () => {
    const thirtySecondsLeft = (): number => 30_000;
    const [entry] = offerDockEntries(state([truce("t1")]), new Map(), new Set(), 9_000_000, thirtySecondsLeft);
    expect(entry?.remainingMs).toBe(30_000);
  });

  it("flags an offer that would spend your coin or Shards", () => {
    const entries = offerDockEntries(
      state([truce("pay", { terms: { give: { gold: 0, shard: 0 }, ask: { gold: 0, shard: 2 } } }), truce("paid", { terms: { give: { gold: 50, shard: 0 }, ask: { gold: 0, shard: 0 } } })]),
      new Map(),
      new Set(),
      0,
      () => undefined
    );
    expect(Object.fromEntries(entries.map((entry) => [entry.id, entry.costsYou]))).toEqual({ pay: true, paid: false });
    // A resource supply ask commits your slots until cancelled, so it costs you too.
    const [supply] = offerDockEntries(state([truce("supply", { terms: { give: { gold: 0, shard: 0 }, ask: { gold: 0, shard: 0, resources: { CRYSTAL: 2 } } } })]), new Map(), new Set(), 0, () => undefined);
    expect(supply?.costsYou).toBe(true);
  });

  it("forgets offers that are gone, so its first-seen map stays bounded", () => {
    const seen = new Map<string, number>();
    offerDockEntries(state([truce("t1"), truce("t2")]), seen, new Set(), 0);
    offerDockEntries(state([truce("t2")]), seen, new Set(), 1);
    expect([...seen.keys()]).toEqual(["t2"]);
  });

  it("shows truce terms and an alliance without an expiry", () => {
    const entries = offerDockEntries(
      state([truce("t1", { terms: { give: { gold: 0, shard: 0 }, ask: { gold: 60, shard: 0 } } })], [{ id: "a1", fromPlayerId: "p9", toPlayerId: "me", createdAt: 0, fromName: "Milo" }]),
      new Map(),
      new Set(["a1"]),
      0,
      () => undefined
    );
    expect(entries.map((entry) => [entry.kind, entry.headline, entry.terms, entry.remainingMs, entry.pending])).toEqual([
      ["truce", "offers a 12h truce", "you pay 60 coin", 300_000, false],
      ["alliance", "proposes an alliance", "", undefined, true]
    ]);
    const html = offerDockHtml(entries);
    expect(html).toContain("<strong>Tove</strong> offers a 12h truce");
    expect(html).toContain(">5:00<");
    expect(html).toMatch(/data-offer-id="a1" disabled/);
  });

  it("escapes player-chosen names", () => {
    const html = offerDockHtml(offerDockEntries(state([truce("t1", { fromName: "<img src=x>" })]), new Map(), new Set(), 0));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x&gt;");
  });

  it("caps the rows and points to Alliances for the rest", () => {
    const entries = offerDockEntries(state(["a", "b", "c", "d", "e"].map((id) => truce(id))), new Map(), new Set(), 0, () => undefined);
    const html = offerDockHtml(entries);
    expect(html.match(/class="offer-dock-row"/g)).toHaveLength(OFFER_DOCK_MAX_ROWS);
    expect(html).toContain("+2 more offers in Alliances");
  });

  it("maps buttons to the same messages the Alliances tab sends", () => {
    expect(offerDockMessage("accept", "truce", "t1")).toEqual({ type: "TRUCE_ACCEPT", requestId: "t1" });
    expect(offerDockMessage("decline", "truce", "t1")).toEqual({ type: "TRUCE_REJECT", requestId: "t1" });
    expect(offerDockMessage("accept", "alliance", "a1")).toEqual({ type: "ALLIANCE_ACCEPT", requestId: "a1" });
    expect(offerDockMessage("decline", "alliance", "a1")).toEqual({ type: "ALLIANCE_REJECT", requestId: "a1" });
    expect(offerDockMessage("cancel", "truce", "t1")).toBeUndefined();
    expect(offerDockMessage("accept", "truce", undefined)).toBeUndefined();
  });

  it("formats the countdown as minutes and seconds", () => {
    expect(formatOfferCountdown(300_000)).toBe("5:00");
    expect(formatOfferCountdown(61_001)).toBe("1:02");
    expect(formatOfferCountdown(1)).toBe("0:01");
  });
});

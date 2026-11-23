import { describe, expect, it } from "vitest";

import type { AllianceRequest, LeaderboardOverallEntry, TruceRequest } from "../client-types.js";
import { dealSkeletonHtml, diplomacyListHtml, diplomacyResponseMessage, type DiplomacyListInput } from "./client-hud-v2-diplomacy.js";

const names: Record<string, string> = { me: "Lumen Accord", "ai-1": "Tove", "ai-2": "Astrid", "p-3": "Nordmark" };
const rank = (id: string, tiles: number, position: number): LeaderboardOverallEntry => ({ id, name: names[id] ?? id, tiles, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: tiles, rank: position });

const input = (overrides: Partial<DiplomacyListInput> = {}): DiplomacyListInput => ({
  me: "me",
  metPlayerIds: new Set<string>(),
  allies: [],
  activeTruces: [],
  incomingAlliance: [],
  incomingTruce: [],
  leaderboard: [rank("ai-1", 135, 1), rank("p-3", 27, 2), rank("me", 20, 3), rank("barbarian-1", 400, 4)],
  nameOf: (id) => names[id] ?? "",
  colorOf: () => undefined,
  nowMs: 0,
  ...overrides
});

// Playtest 2026-11-12 (pt-diplomat): six alliance offers sent from the deal
// screen were nowhere on the phone, with no way to see or withdraw them.
describe("phone Diplomacy list: offers you sent", () => {
  it("lists pending alliance and truce offers with Withdraw buttons", () => {
    const alliance: AllianceRequest = { id: "a1", fromPlayerId: "me", toPlayerId: "p-3", createdAt: 0, terms: { give: { gold: 10 }, ask: { gold: 0 } } };
    const truce: TruceRequest = { id: "t1", fromPlayerId: "me", toPlayerId: "ai-2", createdAt: 0, expiresAt: 3 * 3_600_000, durationHours: 24 };
    const html = diplomacyListHtml(input({ outgoingAlliance: [alliance], outgoingTruce: [truce] }));
    expect(html).toContain("Sent · 2");
    expect(html).toContain("Nordmark");
    expect(html).toContain("Astrid");
    expect(html).toContain('data-v2-dip-cancel="alliance" data-request-id="a1"');
    expect(html).toContain('data-v2-dip-cancel="truce" data-request-id="t1"');
    expect(html).toMatch(/Alliance · [^<]*10 coin[^<]* · waiting/);
  });

  it("withdraws through the gateway's existing cancel messages", () => {
    expect(diplomacyResponseMessage("alliance", "CANCEL", "a1")).toEqual({ type: "ALLIANCE_CANCEL", requestId: "a1" });
    expect(diplomacyResponseMessage("truce", "CANCEL", "t1")).toEqual({ type: "TRUCE_CANCEL", requestId: "t1" });
    expect(diplomacyResponseMessage("truce", "ACCEPT", "t1")).toEqual({ type: "TRUCE_ACCEPT", requestId: "t1", confirmedResourceSupply: true });
  });

  it("shows no Sent section when nothing is pending", () => {
    expect(diplomacyListHtml(input())).not.toContain("Sent ·");
  });
});

// Playtest 2026-11-12: the only way to a first deal was Ranks → profile →
// Diplomacy (about 9 minutes to find), while this list said only "No empires met yet".
describe("phone Diplomacy list: empires you haven't met", () => {
  it("offers ranked empires you haven't met, without you or barbarians", () => {
    const html = diplomacyListHtml(input());
    expect(html).toContain("No empires met yet. You can still offer a deal to any empire below.");
    expect(html).toContain("Not met yet · 2");
    expect(html).toContain('data-v2-dip-open="ai-1"');
    expect(html).toContain('data-v2-dip-open="p-3"');
    expect(html).not.toContain('data-v2-dip-open="me"');
    expect(html).not.toContain("barbarian-1");
  });

  it("doesn't repeat a met empire among the unmet ones", () => {
    const html = diplomacyListHtml(input({ metPlayerIds: new Set(["ai-1"]) }));
    expect(html).toContain("Not met yet · 1");
    expect(html.match(/data-v2-dip-open="ai-1"/g)).toHaveLength(1);
  });
});

// Playtest 2026-11-13 (pt-diplomat): once a Sent list appeared, the met and
// unmet sections each scrolled on their own and were squeezed into overlapping
// slivers, and the list jumped back to the top after every deal.
describe("phone Diplomacy list: layout", () => {
  it("is one scroll container that keeps its place across repaints", () => {
    const truce: TruceRequest = { id: "t1", fromPlayerId: "me", toPlayerId: "ai-2", createdAt: 0, expiresAt: 3_600_000, durationHours: 24 };
    const html = diplomacyListHtml(input({ outgoingTruce: [truce], metPlayerIds: new Set(["p-3"]) }));
    expect(html.startsWith('<div class="v2d-list" data-v2-scroll="diplomacy">')).toBe(true);
    expect(html.match(/data-v2-scroll=/g)).toHaveLength(1);
  });

  // 2026-11-21: "Alliances & supply ▸" opened the old pre-v2 Alliances panel, now deleted.
  it("has no link out to the removed Alliances panel", () => {
    expect(diplomacyListHtml(input())).not.toContain("data-v2-dip-alliances");
  });

  it("keeps the empty note out of the narrow grid", () => {
    expect(diplomacyListHtml(input())).not.toMatch(/<div class="v2d-grid"><div class="v2s-empty">/);
  });
});

// Playtest run 2: truces ran out with no warning, and Extend was two screens away.
describe("phone Diplomacy list: truces ending", () => {
  const truce = (id: string, endsAt: number) => ({ otherPlayerId: id, otherPlayerName: names[id] ?? id, startedAt: 0, endsAt, createdByPlayerId: "me" });

  it("pins a truce in its last two hours with the time left and an Extend button that opens the deal", () => {
    const html = diplomacyListHtml(input({ activeTruces: [truce("ai-1", 90 * 60_000), truce("p-3", 9 * 3_600_000)] }));
    expect(html).toContain("Truces ending · 1");
    expect(html).toMatch(/v2d-ending[\s\S]*Tove[\s\S]*Truce ends 1h 30m[\s\S]*data-v2-dip-open="ai-1">Extend</);
    expect(html).not.toMatch(/Nordmark<\/b><span>Truce ends/);
    expect(html).toContain("v2d-emp-truce v2d-emp-ending");
    expect(html).toContain("Truce 9h");
  });

  it("offers no Extend once the truce is at its total-length cap", () => {
    const capped = { ...truce("ai-1", 47 * 3_600_000), startedAt: 0 };
    const html = diplomacyListHtml(input({ activeTruces: [capped], nowMs: 46 * 3_600_000 }));
    expect(html).toContain("Truces ending · 1");
    expect(html).not.toContain(">Extend<");
    expect(html).toContain('data-v2-dip-open="ai-1">Open<');
  });

  it("shows no section when no truce is ending", () => {
    expect(diplomacyListHtml(input({ activeTruces: [truce("ai-1", 3 * 3_600_000)] }))).not.toContain("Truces ending");
  });
});

describe("Diplomacy deal header", () => {
  it("links the empire's name and a Profile button to their profile", () => {
    const html = dealSkeletonHtml("Rival <House>", "Truce 3h", "p2");
    expect(html.match(/data-hud-v2-profile="p2"/g)).toHaveLength(2);
    expect(html).toContain("Profile ▸");
    expect(html).toContain("Rival &lt;House&gt;");
  });

  it("shows a plain name with no profile link when the empire is unknown", () => {
    expect(dealSkeletonHtml("Empire")).not.toContain("data-hud-v2-profile");
  });
});

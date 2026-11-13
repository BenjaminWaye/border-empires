import { describe, expect, it } from "vitest";

import type { AllianceRequest, LeaderboardOverallEntry, TruceRequest } from "../client-types.js";
import { diplomacyListHtml, diplomacyResponseMessage, type DiplomacyListInput } from "./client-hud-v2-diplomacy.js";

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

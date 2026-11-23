import { describe, expect, it } from "vitest";
import { PUBLIC_HOUSE_NOT_FOUND_HTML, parsePublicHouseProfile, publicHouseHtml } from "./client-public-house-view.js";

const body = {
  ok: true, name: "Varn", rating: 1240, lastRatingDelta: -30, peakRating: 1270, contestsPlayed: 2, bestRank: 1, wins: 1,
  contests: [
    { seasonSequence: 2, endedAt: Date.UTC(2026, 10, 20), rank: 1, houses: 88, score: 90.4, tiles: 20, ratingAfter: 1240, ratingDelta: -30, won: true, victoryPath: "Town Control" },
    { seasonSequence: 1, endedAt: Date.UTC(2026, 9, 2), rank: 14, houses: null, score: 40, tiles: 12, won: false },
    { rank: "bad" }
  ],
  charges: [{ title: "Survey Claim", kind: "SURVEY", rarity: "RARE", renown: 3, hoursHeld: 30, places: ["Isle of Aln"], seasonSequence: 2, foil: true }],
  awards: [
    { kind: "NEVER_GAVE_UP", seasonSequence: 1, redeploys: 6 },
    { kind: "COMEBACK_KID", seasonSequence: 2, redeploys: 1, rank: 4 },
    { kind: "MADE_UP", seasonSequence: 2, redeploys: 1 }
  ],
  records: [
    { kind: "LONGEST_ROAD", seasonSequence: 2, tiles: 31, from: "Aln", to: "Bel" },
    { kind: "MOST_DEADLY_TILE", seasonSequence: 1, x: 5, y: 6, manpowerLost: 1500 },
    { kind: "UNKNOWN", seasonSequence: 1 }
  ]
};

describe("public House profile page", () => {
  it("parses the gateway reply and drops malformed rows", () => {
    const profile = parsePublicHouseProfile(body);
    expect(profile?.contests).toHaveLength(2);
    expect(profile?.records).toHaveLength(2);
    expect(profile?.charges[0]).toEqual({ title: "Survey Claim", rarity: "RARE", renown: 3, hoursHeld: 30, places: ["Isle of Aln"], seasonSequence: 2, foil: true });
    expect(parsePublicHouseProfile({ ok: false, error: "not_found" })).toBeUndefined();
    expect(parsePublicHouseProfile(null)).toBeUndefined();
  });

  it("renders rating, history, charges and records in player wording", () => {
    const html = publicHouseHtml(parsePublicHouseProfile(body)!);
    expect(html).toContain("<h1>Varn</h1>");
    expect(html).toContain("1,240");
    expect(html).toContain("−30 last contest");
    expect(html).toContain("#1</b><span>of 88</span>");
    expect(html).toContain("Won · Town Control");
    expect(html).toContain("20 Nov 2026 · score 90 · 20 tiles");
    expect(html).toContain("31 tiles from Aln to Bel");
    expect(html).toContain("<b>Never Gave Up</b><span>Knocked out and redeployed 6 times, more than any other House</span><i>Sector Contest 1</i>");
    expect(html).toContain("<b>Comeback Kid</b><span>Knocked out and redeployed once, and still finished #4</span>");
    expect(html).not.toContain("MADE_UP");
    expect(html).toContain("Lost 1,500 manpower at (5, 6)");
    expect(html).toContain("◆◆◆ Rare · Isle of Aln");
    expect(html).not.toMatch(/season/i);
  });

  it("escapes the House name and place names", () => {
    const html = publicHouseHtml(parsePublicHouseProfile({ ...body, name: `<img src=x onerror="a">`, charges: [{ ...body.charges[0], places: ["<b>x</b>"] }] })!);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;");
  });

  it("shows empty states for a House with no finished contest", () => {
    const html = publicHouseHtml(parsePublicHouseProfile({ ok: true, name: "New" })!);
    expect(html).toContain("No finished Sector Contest yet.");
    expect(html).toContain("after a first contest");
    expect(PUBLIC_HOUSE_NOT_FOUND_HTML).toContain("no longer shared");
  });
});

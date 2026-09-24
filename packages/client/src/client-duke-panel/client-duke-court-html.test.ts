import { describe, expect, it } from "vitest";
import { dukeCourtHtml, dukeLogHtml } from "./client-duke-court-html.js";
import { D, H, NOW, dukeStatus } from "./client-duke-fixtures.js";

const pending = () => dukeStatus({ court: { ...dukeStatus().court, offer: { status: "PENDING", protectedUntil: null, moveLockedUntil: null } } });

describe("dukeCourtHtml", () => {
  it("shows the offer only while pending, with the exact terms", () => {
    expect(dukeCourtHtml(dukeStatus(), NOW)).not.toContain("data-duke-offer");
    const html = dukeCourtHtml(pending(), NOW);
    expect(html).toContain("30 days of Court protection");
    expect(html).toContain("90 days");
    expect(html).toContain('data-duke-offer-answer="accept"');
    expect(html).toContain('data-duke-offer-answer="decline"');
  });
  it("explains Court Strength, Domain Weight, Influence and Wardens in plain words", () => {
    const html = dukeCourtHtml(dukeStatus({ economy: { developmentUpkeepPerCycle: 2, incursionsPerCyclePerSystem: 1.5, wardenPoolPerCycle: 3 } }), NOW);
    expect(html).toContain("280 of 300");
    expect(html).toContain("Court Strength is the Court&#39;s grip");
    expect(html).toContain("#1 of 2 Dukes");
    expect(html).toContain("It also pays for development upkeep (2 per Cycle now)");
    expect(html).toContain("<b>1.5</b> incursions per Cycle, out of 3");
  });
  it("the wager button is enabled when you can, and says why when you can't", () => {
    expect(dukeCourtHtml(dukeStatus(), NOW)).not.toMatch(/data-duke-court-move disabled/);
    expect(dukeCourtHtml(dukeStatus({ influence: 2 }), NOW)).toContain("You need at least 5 Influence.");
    expect(dukeCourtHtml(dukeStatus({ petition: { available: false, availableAt: NOW + 3 * D } }), NOW)).toContain("You can again in 3d.");
    expect(dukeCourtHtml(dukeStatus({ court: { ...dukeStatus().court, canMoveAgainstCourt: false } }), NOW)).toContain("Locked by the Court&#39;s offer.");
    expect(dukeCourtHtml(dukeStatus({ court: { ...dukeStatus().court, fallen: true, canMoveAgainstCourt: false } }), NOW)).toContain("The Court has fallen.");
  });
});

describe("dukeLogHtml", () => {
  it("lists the digest and surveyed systems, live or aged", () => {
    const html = dukeLogHtml(
      dukeStatus({
        intel: [
          { seasonId: "a", label: "Alpha", stability: 60, defenderHull: 40, at: NOW, live: true },
          { seasonId: "b", label: "Beta", stability: 100, defenderHull: null, at: NOW - 30 * H, live: false }
        ]
      }),
      NOW
    );
    expect(html).toContain("defended (Fighter hull 40%)");
    expect(html).toContain("live, a Probe is watching");
    expect(html).toContain("1d 6h ago");
    expect(html).toContain("Incursion hit Aurelia");
  });
  it("says so when there is nothing yet, and escapes log text", () => {
    expect(dukeLogHtml(dukeStatus({ digest: [] }), NOW)).toContain("Nothing yet.");
    expect(dukeLogHtml(dukeStatus({ digest: [{ at: NOW, kind: "INTEL", text: "<img src=x onerror=1>" }] }), NOW)).not.toContain("<img");
  });
});

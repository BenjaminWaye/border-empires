import { describe, expect, it } from "vitest";
import { dukeHudHtml, dukePanelHtml, escapeHtml } from "./client-duke-html.js";
import { NOW, dukeStatus } from "./client-duke-fixtures.js";

const H = 60 * 60 * 1000;
const targets = [
  { seasonId: "season-b", label: "Kel's World" },
  { seasonId: "season-c", label: "Vex" }
];

describe("dukeHudHtml", () => {
  it("shows the one-choice banner first, then Stability, Domain Weight and Court Strength", () => {
    const html = dukeHudHtml(dukeStatus(), NOW);
    expect(html.indexOf("Choose one action this Cycle")).toBeGreaterThan(-1);
    expect(html.indexOf("Choose one action")).toBeLessThan(html.indexOf("Stability"));
    expect(html).toContain("4 more hits before it is contested");
    expect(html).toContain("#1 of 2 Dukes");
    expect(html).toContain("280 / 300");
  });
  it("gives every jargon meter a plain-language tooltip", () => {
    const html = dukeHudHtml(dukeStatus(), NOW);
    expect(html).toMatch(/title="Court Strength is the Court&#39;s grip/);
    expect(html).toMatch(/title="Domain Weight is your score for the throne/);
    expect(html).toMatch(/title="Stability is how firmly you hold a Sector/);
  });
  it("switches to the used state and announces the fallen Court", () => {
    const used = dukeHudHtml(dukeStatus({ gate: { available: false, availableAt: NOW + 3 * 24 * H, cycleMs: 1 } }), NOW);
    expect(used).toContain("Your action is used");
    expect(used).toContain("dk-banner-used");
    const fallen = dukeHudHtml(dukeStatus({ court: { ...dukeStatus().court, current: 0, fallen: true } }), NOW);
    expect(fallen).toContain("The Court has fallen");
  });
  it("copes with a Duke who somehow holds no Sector", () => {
    expect(dukeHudHtml(dukeStatus({ meters: { sectors: [], domainWeight: 0, rank: 0, dukeCount: 0 } }), NOW)).toContain("no Sector held");
  });
});

describe("dukePanelHtml", () => {
  it("shows the Court offer only while it is pending, with the exact terms", () => {
    expect(dukePanelHtml(dukeStatus(), NOW, targets)).not.toContain("data-duke-offer");
    const pending = dukePanelHtml(dukeStatus({ court: { ...dukeStatus().court, offer: { status: "PENDING", protectedUntil: null, moveLockedUntil: null } } }), NOW, targets);
    expect(pending).toContain("30 days of Court protection");
    expect(pending).toContain("90 days");
    expect(pending).toContain('data-duke-offer-answer="accept"');
    expect(pending).toContain('data-duke-offer-answer="decline"');
  });
  it("Docket warns of the incursion and what it will cost with no Fighter", () => {
    const html = dukePanelHtml(dukeStatus(), NOW, targets);
    expect(html).toContain("Unidentified craft arriving in 2d");
    expect(html).toContain("lose 20 Stability");
    expect(dukePanelHtml(dukeStatus({ ships: { fighterHulls: [100], probeStock: 0, inFlight: null, orbiting: [] } }), NOW, targets)).toContain("Your Fighter will defend");
  });
  it("prices builds in days at the player's own rate", () => {
    const html = dukePanelHtml(dukeStatus(), NOW, targets);
    expect(html).toContain("80, 14 days at your rate");
    expect(html).toContain("25, 5 days at your rate");
    expect(dukePanelHtml(dukeStatus({ production: { ratePerDay: 2, slot: null, idleBank: 0 } }), NOW, targets)).toContain("80, 40 days at your rate");
  });
  it("disables Invest with a reason once the weekly action is used or the slot is busy", () => {
    const used = dukePanelHtml(dukeStatus({ gate: { available: false, availableAt: NOW + H, cycleMs: 1 } }), NOW, targets);
    expect(used).toMatch(/data-duke-invest="FIGHTER" disabled title="You&#39;ve used this Cycle&#39;s action\."/);
    const busy = dukePanelHtml(dukeStatus({ docket: { ...dukeStatus().docket, slotState: "BUILDING" }, production: { ratePerDay: 6, idleBank: 0, slot: { kind: "FIGHTER", label: "Fighter", cost: 80, progress: 40, daysLeft: 7 } } }), NOW, targets);
    expect(busy).toContain("Your build slot is busy.");
    expect(busy).toContain("Building Fighter: 7 days left (50%)");
    expect(busy).toContain("data-duke-cancel-build");
  });
  it("Launch Probe needs a Probe; Raid needs a Fighter and a surveyed target", () => {
    const none = dukePanelHtml(dukeStatus(), NOW, targets);
    expect(none).toMatch(/data-duke-order-launch="PROBE" disabled title="You have no Probe/);
    expect(none).toMatch(/data-duke-order-launch="RAID" disabled/);
    const ready = dukePanelHtml(
      dukeStatus({
        ships: { fighterHulls: [100], probeStock: 1, inFlight: null, orbiting: [] },
        intel: [{ seasonId: "season-b", label: "Kel's World", stability: 80, defenderHull: null, at: NOW, live: true }]
      }),
      NOW,
      targets
    );
    expect(ready).not.toMatch(/data-duke-order-launch="PROBE" disabled/);
    expect(ready).not.toMatch(/data-duke-order-launch="RAID" disabled/);
    const raidSelect = ready.slice(ready.indexOf("data-duke-raid-target"), ready.indexOf('data-duke-order-launch="RAID"'));
    expect(raidSelect).toContain("season-b");
    expect(raidSelect).not.toContain("season-c");
  });
  it("unsurveyed systems are shown as Unknown, never by name", () => {
    const html = dukePanelHtml(dukeStatus(), NOW, targets);
    expect(html).toContain("Unknown system 1");
    expect(html).not.toContain("Kel&#39;s World");
  });
  it("lists surveyed intel as live or aged, and the digest newest first as given", () => {
    const html = dukePanelHtml(
      dukeStatus({
        intel: [
          { seasonId: "a", label: "Alpha", stability: 60, defenderHull: 40, at: NOW, live: true },
          { seasonId: "b", label: "Beta", stability: 100, defenderHull: null, at: NOW - 30 * H, live: false }
        ]
      }),
      NOW,
      targets
    );
    expect(html).toContain("defended (Fighter hull 40%)");
    expect(html).toContain("live, a Probe is watching");
    expect(html).toContain("undefended");
    expect(html).toContain("1d 6h ago");
    expect(html).toContain("Incursion hit Aurelia");
  });
  it("escapes every player-derived string", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const html = dukePanelHtml(
      dukeStatus({
        meters: { sectors: [{ seasonId: "s1", label: evil, stability: 50, hitsRemaining: 2 }], domainWeight: 1, rank: 1, dukeCount: 1 },
        digest: [{ at: NOW, kind: "INTEL", text: evil }],
        ships: { fighterHulls: [], probeStock: 0, inFlight: null, orbiting: [{ seasonId: "o", label: evil }] }
      }),
      NOW,
      [{ seasonId: evil, label: evil }]
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(escapeHtml(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });
});

import { describe, expect, it } from "vitest";
import { dukeSystemHtml } from "./client-duke-system-html.js";
import { D, H, NOW, buildOption, dukeStatus, dukeSystem } from "./client-duke-fixtures.js";
import type { DukeShipKind, DukeStatus, DukeSystemView } from "./client-duke-types.js";

const targets = [
  { seasonId: "season-b", label: "Kel's World" },
  { seasonId: "season-c", label: "Vex" }
];
const render = (system: DukeSystemView, status: DukeStatus = dukeStatus({ systems: [system] }), selectedShip: DukeShipKind | null = null) =>
  dukeSystemHtml(status, system, { now: NOW, targets, selectedShip });

describe("the planet panel header", () => {
  it("names the planet, its Stability and how many hits it can take", () => {
    const html = render(dukeSystem());
    expect(html).toContain("<h3>Aurelia</h3>");
    expect(html).toContain("Industrial planet");
    expect(html).toContain("Stability 80");
    expect(html).toContain("4 more hits before it is contested");
    expect(html).toContain("Production <b>6</b>");
  });
  it("warns what an incoming craft will do, and says when a Fighter will meet it", () => {
    expect(render(dukeSystem())).toContain("No Fighter here: this system will lose 20 Stability.");
    expect(render(dukeSystem({ fighters: [100] }))).toContain("Your Fighter here will meet it.");
    expect(render(dukeSystem({ incursionArrivesAt: null }))).not.toContain("Craft arriving");
  });
  it("shows the build in progress with a cancel and the time left, and whether today's order is ready", () => {
    const busy = render(dukeSystem({ slot: { kind: "FIGHTER", label: "Fighter", startedAt: NOW - 4 * H, completesAt: NOW + 4 * H }, order: { ready: false, readyAt: NOW + 20 * H } }));
    expect(busy).toContain("building <b>Fighter</b>, ready in 4h");
    expect(busy).toContain("next order in 20h");
    expect(busy).toContain('style="width:50%"');
    expect(busy).toContain("data-duke-cancel-build");
    const idle = render(dukeSystem());
    expect(idle).toContain("<b>order ready</b>");
    expect(idle).toContain("nothing building");
    expect(idle).not.toContain("data-duke-cancel-build");
  });
});

describe("ships are how you give an order", () => {
  it("with no ships it says what to build", () => {
    expect(render(dukeSystem())).toContain("No ships. Build a Fighter");
  });
  it("each Fighter and the Probe stock are pressable, and pressing selects", () => {
    const html = render(dukeSystem({ fighters: [80, 100], probeStock: 2 }));
    expect(html.match(/data-duke-ship="FIGHTER"/g)).toHaveLength(2);
    expect(html).toContain("hull 80%");
    expect(html).toContain("Probe ×2");
    expect(render(dukeSystem({ fighters: [100] }), undefined, "FIGHTER")).toContain("dk-ship-on");
  });
  it("a selected Probe offers every other system, unsurveyed ones as Unknown", () => {
    const status = dukeStatus({ intel: [{ seasonId: "season-c", label: "Vex", stability: 100, defenderHull: null, at: NOW, live: true }] });
    const html = render(dukeSystem({ probeStock: 1 }), status, "PROBE");
    const select = html.slice(html.indexOf("data-duke-probe-target"), html.indexOf('data-duke-order-launch="PROBE"'));
    expect(select).toContain("Unknown system 1");
    expect(select).toContain("Vex");
    expect(select).not.toContain("Kel&#39;s World");
    expect(html).toContain("It is used up.");
  });
  it("a selected Fighter offers only surveyed systems, with what the Probe last saw", () => {
    const status = dukeStatus({
      intel: [
        { seasonId: "season-b", label: "Kel's World", stability: 60, defenderHull: 40, at: NOW, live: true },
        { seasonId: "season-c", label: "Vex", stability: 100, defenderHull: null, at: NOW - 30 * H, live: false }
      ]
    });
    const html = render(dukeSystem({ fighters: [100] }), status, "FIGHTER");
    expect(html).toContain("Kel&#39;s World: Stability 60, defended (hull 40%)");
    expect(html).toContain("Vex: Stability 100, undefended, 1d 6h ago");
    expect(html).toContain("leaves it one defender short");
  });
  it("raiding with nothing surveyed is disabled with the reason", () => {
    const html = render(dukeSystem({ fighters: [100] }), undefined, "FIGHTER");
    expect(html).toMatch(/data-duke-order-launch="RAID" disabled title="Send a Probe there first/);
  });
  it("lists orders in flight from this system", () => {
    const status = dukeStatus({ flights: [{ kind: "PROBE", fromSeasonId: "s1", seasonId: "season-b", arrivesAt: NOW + 6 * H }, { kind: "RAID", fromSeasonId: "elsewhere", seasonId: "season-c", arrivesAt: NOW + H }] });
    const html = render(dukeSystem(), status);
    expect(html).toContain("Probe on its way to Unknown system 1, arriving in 6h");
    expect(html).not.toContain("Fighter on its way");
  });
});

describe("the build menu", () => {
  it("shows how long each option takes at this system's own Production", () => {
    const html = render(dukeSystem());
    expect(html).toContain("ready in 8h");
    expect(html).toContain("ready in 4h");
    expect(html).toContain("Defends this system, and can raid");
  });
  it("an unavailable option is disabled and says why", () => {
    const html = render(dukeSystem({ options: [buildOption({ blockedBy: "SLOT_BUSY" })] }));
    expect(html).toMatch(/data-duke-build="FIGHTER" disabled title="This system is already building something/);
  });
  it("lists each body: the developed one as built, the free one as an option to build", () => {
    const html = render(dukeSystem());
    expect(html).toContain("Gas giant");
    expect(html).toContain("data-duke-develop=\"0\"");
    expect(html).toContain("+3 Production: builds here go faster");
    expect(html).toContain("Ice moon");
    expect(html).toContain("Cryo Refinery online: +6 Stability per Cycle here");
  });
  it("Fortify is one press for +15 Stability now, or a note when Stability is full", () => {
    expect(render(dukeSystem({ stability: 60 }))).toContain("+15 Stability now");
    expect(render(dukeSystem({ stability: 100, fortify: { stability: 15, blockedBy: "ALREADY_STABLE" } }))).toContain("Stability is full: nothing to Fortify.");
  });
  it("explains the upkeep rule and what you pay now", () => {
    const html = render(dukeSystem(), dukeStatus({ economy: { developmentUpkeepPerCycle: 2, incursionsPerCyclePerSystem: 1.5, wardenPoolPerCycle: 3 } }));
    expect(html).toContain("The first development in each system is free");
    expect(html).toContain("(you pay 2 now)");
  });
});

describe("escaping", () => {
  it("escapes planet, target and development names", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const html = render(
      dukeSystem({ label: evil, bodies: [{ index: 0, kind: "GAS_GIANT", development: { label: evil, summary: evil }, base: true, baseOption: null, option: null }] }),
      dukeStatus({ flights: [{ kind: "PROBE", fromSeasonId: "s1", seasonId: evil, arrivesAt: NOW + D }], intel: [{ seasonId: evil, label: evil, stability: 1, defenderHull: null, at: NOW, live: true }] }),
      "PROBE"
    );
    expect(html).not.toContain("<img");
  });
});

describe("bases (§31)", () => {
  it("a body without a base offers Establish base; once based, its development", () => {
    const html = dukeSystemHtml(dukeStatus(), dukeSystem(), { now: NOW, targets: [], selectedShip: null });
    expect(html).toContain('data-duke-base="2"');
    expect(html).toContain("Lets you build a Mining Station here");
    expect(html).not.toContain('data-duke-develop="2"');
    expect(html).toContain('data-duke-develop="0"');
  });
});

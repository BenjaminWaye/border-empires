// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { scoutClock } from "./client-scout-drone-dock.js";
import { SCOUT_REPORT_CARD_MS, renderScoutDroneHud, scoutDroneReadyToOffer, scoutReportCardVisible, scoutReportChips } from "./client-scout-drone-hud.js";
/** Same selector as the compact tip lift rule; client-scout-drone-dock-layout.test.ts pins the CSS side. */
const IN_FLIGHT_PILL = '#scout-drone-pill:not(.is-offer)[style*="flex"]';

const report = { targetX: 12, targetY: 4, focusX: 15, focusY: 7, towns: 1, docks: 3, waystations: 2, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: ["rival"], at: 1_000 };

const baseState = () => {
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  state.mapPrep = null;
  state.changelog.open = false;
  state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile);
  return state;
};

const flight: ScoutDroneFlight = { endReason: "TARGET", launchedAt: 0, landsAt: 200_000, targetX: 5, targetY: 1, turnIndex: 4, steps: [0, 1, 2, 3, 4, 5].map((i) => ({ x: 1 + i, y: 1, at: i * 3_000 })) };

describe("scout drone HUD (player review 2026-11-21)", () => {
  it("turns a report into icon chips, most valuable first", () => {
    expect(scoutReportChips(report).map((chip) => `${chip.kind}:${chip.count}`)).toEqual(["town:1", "dock:3", "waystation:2", "empire:1"]);
  });

  it("gives resources without an icon a shared gem chip, never a bare dot", () => {
    const withResources = { ...report, empiresSighted: [], towns: 0, docks: 0, waystations: 0, resourceTiles: 5, resourcesSighted: [{ resource: "FISH", count: 2 }, { resource: "NOT_A_RESOURCE", count: 3 }] };
    expect(scoutReportChips(withResources).map((chip) => `${chip.kind}:${chip.count}:${chip.label}`)).toEqual(["resource-icon:2:Fish", "resource:3:Not_a_resource"]);
  });

  // Review round 8: Grain (FARM) showed the gem; deposits map to their own icon.
  it("gives a deposit its resource's icon", () => {
    const grain = { ...report, empiresSighted: [], towns: 0, docks: 0, waystations: 0, resourceTiles: 8, resourcesSighted: [{ resource: "FARM", count: 8 }] };
    expect(scoutReportChips(grain).map((chip) => `${chip.kind}:${chip.label}`)).toEqual(["resource-icon:Grain"]);
  });

  it("shows the landing report on its own card until it is closed", () => {
    const state = baseState();
    state.scoutDroneReport = { ...report };
    state.scoutFindFocus = { x: 1, y: 1 };
    const deps = { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 2_000 };
    renderScoutDroneHud(state, deps);
    const card = document.getElementById("scout-report-card")!;
    expect(card.style.display).toBe("flex");
    expect(card.querySelectorAll(".srs-chip")).toHaveLength(4);
    expect(document.body.classList.contains("scout-focus")).toBe(true);
    // Review round 8: Show duplicated the tappable chips; only ✕ remains.
    expect(card.querySelector(".srs-show")).toBeNull();
    (card.querySelector(".srs-close") as HTMLButtonElement).click();
    expect(state.scoutDroneReport).toBeUndefined();
    expect(state.scoutFindFocus).toBeUndefined();
    renderScoutDroneHud(state, deps);
    expect(card.style.display).toBe("none");
    expect(document.body.classList.contains("scout-focus")).toBe(false);
  });

  // Player report 2026-11-21: "?" opened the guide for one scout phase; the next phase must start folded,
  // even when it follows with no gap (report, then the next plan keeps scout-focus on throughout).
  it("refolds a guide the player opened when the scout phase changes", () => {
    const guideRoot = document.createElement("div");
    guideRoot.id = "tutorial-guide-root";
    document.body.appendChild(guideRoot);
    const state = baseState();
    state.scoutDroneReport = { ...report };
    const deps = { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 2_000 };
    try {
      renderScoutDroneHud(state, deps);
      expect(document.body.classList.contains("scout-focus")).toBe(true);
      guideRoot.classList.add("tg-scout-peek"); // the player taps "?" over the report
      renderScoutDroneHud(state, deps);
      expect(guideRoot.classList.contains("tg-scout-peek")).toBe(true); // same phase: stays open
      state.scoutDronePicking.active = true; // straight into planning the next drone
      renderScoutDroneHud(state, deps);
      expect(document.body.classList.contains("scout-focus")).toBe(true);
      expect(guideRoot.classList.contains("tg-scout-peek")).toBe(false);
    } finally {
      state.scoutDronePicking.active = false;
      state.scoutDroneReport = undefined;
      renderScoutDroneHud(state, deps);
      guideRoot.remove();
    }
  });

  it("hides the report while planning, once the next drone is up, and after it times out", () => {
    const state = baseState();
    state.scoutDroneReport = { ...report };
    expect(scoutReportCardVisible(state, 2_000)).toBe(true);
    expect(scoutReportCardVisible(state, 1_000 + SCOUT_REPORT_CARD_MS)).toBe(false);
    state.scoutDroneFlight = { ...flight, launchedAt: 3_000, landsAt: 90_000 };
    expect(scoutReportCardVisible(state, 4_000)).toBe(false);
    state.scoutDroneFlight = undefined;
    state.scoutDronePicking = { ...state.scoutDronePicking, active: true };
    expect(scoutReportCardVisible(state, 2_000)).toBe(false);
  });

  it("shows a flight pill with the time left while the drone is out, and tapping it frames the drone", () => {
    const state = baseState();
    state.scoutDroneFlight = { ...flight };
    const focus = vi.fn();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus, now: () => 6_000 });
    const pill = document.getElementById("scout-drone-pill")!;
    expect(pill.style.display).toBe("flex");
    expect(pill.querySelector(".sdp-time")?.textContent).toBe("3m 14s");
    // The compact discovery tip lifts above exactly this state (client-hud-v2-compact-overlays.css).
    expect(pill.matches(IN_FLIGHT_PILL)).toBe(true);
    (pill.querySelector("button") as HTMLButtonElement).click();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("stays off the loading screen: a flight replayed on reconnect drew its pill over it", () => {
    const state = baseState();
    state.authSessionReady = false;
    state.scoutDroneFlight = { ...flight };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 6_000 });
    expect(document.getElementById("scout-drone-pill")?.style.display ?? "none").toBe("none");
  });

  it("says Add, not Go, when the planned stops join a drone already in the air", () => {
    const state = baseState();
    state.scoutDroneFlight = { ...flight };
    state.scoutDronePicking = { active: true, stops: [{ x: 1, y: 8 }], bumpAt: 0, shakeAt: 0, launches: 1 };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(document.querySelector("#scout-drone-dock .sd-go-word")?.textContent).toBe("Add");
    expect(document.getElementById("scout-drone-pill")!.style.display).toBe("none");
  });

  it("leads with the tiles explored", () => {
    const state = baseState();
    state.scoutDroneReport = { ...report, explored: 142, at: 5_000 };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 6_000 });
    const card = document.getElementById("scout-report-card")!;
    expect(card.querySelector(".srs-chip b")?.textContent).toBe("+142");
    expect(card.querySelector(".srs-chip-label")?.textContent).toBe("Tiles");
  });

  it("lets a chip step the camera through that kind's finds, keeping the card open", () => {
    const state = baseState();
    state.scoutDroneFinds = { launchedAt: 1, all: [{ kind: "town", x: 3, y: 4 }, { kind: "town", x: 8, y: 9 }] };
    state.scoutDroneReport = { ...report, at: 20_000 };
    const focus = vi.fn();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus, now: () => 20_500 });
    const town = document.querySelector<HTMLButtonElement>('#scout-report-card .srs-chip[data-find-kind="town"]')!;
    town.click();
    town.click();
    town.click();
    expect(focus.mock.calls.map((call) => [call[0], call[1]])).toEqual([[3, 4], [8, 9], [3, 4]]);
    expect(state.scoutDroneReport).toBeDefined();
    expect(state.scoutFindFocus).toEqual({ x: 3, y: 4 });
    // Docks were reported but never spotted mid-flight (older server): that chip stays plain.
    expect(document.querySelector('#scout-report-card button.srs-chip[data-find-kind="dock"]')).toBeNull();
  });

  // Review 2026-11-21: with Show gone, a reload (no SCOUT_FINDS kept) left nothing to tap; the main find's chip
  // falls back to the server's focus.
  it("frames the server's main find from its chip when no finds were spotted on this client", () => {
    const state = baseState();
    state.scoutDroneFinds = undefined;
    state.scoutDroneReport = { ...report, at: 30_000 };
    const focus = vi.fn();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus, now: () => 30_500 });
    const town = document.querySelector<HTMLButtonElement>('#scout-report-card .srs-chip[data-find-kind="town"]')!;
    town.click();
    expect(focus).toHaveBeenCalledWith(15, 7, { select: false });
    expect(document.querySelector('#scout-report-card button.srs-chip[data-find-kind="dock"]')).toBeNull();
  });

  it("steps through the report's own sites when no finds were spotted on this client", () => {
    const state = baseState();
    state.scoutDroneFinds = undefined;
    const sites = { towns: [], docks: [{ x: 40, y: 41 }, { x: 42, y: 43 }], waystations: [], watchtowers: [], planetaryDefense: [], resources: {}, empires: {} };
    state.scoutDroneReport = { ...report, sites, at: 40_000 };
    const focus = vi.fn();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus, now: () => 40_500 });
    const dock = document.querySelector<HTMLButtonElement>('#scout-report-card .srs-chip[data-find-kind="dock"]')!;
    dock.click();
    dock.click();
    expect(focus.mock.calls.map((call) => [call[0], call[1]])).toEqual([[40, 41], [42, 43]]);
  });

  it("labels every report icon with one word", () => {
    expect(scoutReportChips(report).map((chip) => chip.label)).toEqual(["Town", "Docks", "Waystations", "Empire"]);
  });

  // The owner had the "tap here" marker on the map removed; the bottom slot offers the drone instead.
  it("offers the drone while every charge is unused, and tapping the offer opens a plan", () => {
    const state = baseState();
    const rerender = vi.fn();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender, focus: vi.fn(), now: () => 1_000 });
    const pill = document.getElementById("scout-drone-pill")!;
    expect(pill.style.display).toBe("flex");
    expect(pill.classList.contains("is-offer")).toBe(true);
    expect(pill.matches(IN_FLIGHT_PILL)).toBe(false);
    expect(pill.querySelector(".sdp-time")?.textContent).toBe("8");
    (pill.querySelector("button") as HTMLButtonElement).click();
    expect(state.scoutDronePicking.active).toBe(true);
    expect(rerender).toHaveBeenCalled();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender, focus: vi.fn(), now: () => 1_000 });
    expect(pill.style.display).toBe("none");
    expect(document.querySelector("#scout-drone-dock .sd-go-word")?.textContent).toBe("Tap fog");
  });

  it("steps aside while a tile's menu is open", () => {
    const state = baseState();
    state.tileActionMenu = { ...state.tileActionMenu, visible: true };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(document.getElementById("scout-drone-pill")?.style.display ?? "none").toBe("none");
  });

  it("does not offer the drone once a charge is spent", () => {
    const state = baseState();
    state.scoutDroneCharges = { max: 8, refillMs: 14_400_000, usedAt: [0] };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
    expect(document.getElementById("scout-drone-pill")?.style.display ?? "none").toBe("none");
  });

  // Review 2026-11-21: the offer armed a plan on top of another armed pick (Aether Wall, marches, placement).
  it("does not offer the drone while another map pick is armed", () => {
    const state = baseState();
    state.aetherWallTargeting = { ...state.aetherWallTargeting, active: true };
    expect(scoutDroneReadyToOffer(state, 1_000)).toBe(false);
  });

  // Player review round 6: with the guide open in flight it covered the drone and the route for all three.
  it("folds the guide while the drone flies, as while planning and reporting", () => {
    const state = baseState();
    state.scoutDroneFlight = { ...flight };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 6_000 });
    expect(document.body.classList.contains("scout-focus")).toBe(true);
    expect(document.body.classList.contains("scout-flying")).toBe(true);
  });

  // Review 2026-11-21: finding the drone selected the fog tile under it, whose sheet then covered the drone.
  it("frames the drone without selecting a tile", () => {
    const state = baseState();
    state.scoutDroneFlight = { ...flight };
    const focus = vi.fn();
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus, now: () => 6_000 });
    (document.querySelector("#scout-drone-pill button") as HTMLButtonElement).click();
    expect(focus).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), { select: false });
  });

  it("puts units on dock times, short enough for a phone", () => {
    expect(scoutClock(3_570_000)).toBe("1h 00m"); // review 2026-11-21: read "60m"
    expect(scoutClock(48_000)).toBe("48s");
    expect(scoutClock(207_000)).toBe("3m 27s");
    expect(scoutClock(762_000)).toBe("13m");
    expect(scoutClock(3_900_000)).toBe("1h 05m");
  });
});

// @vitest-environment happy-dom
// Playtest Run 5 (d3-1540-explorer, d3-1135-spender): the drone's rules made visible, and its
// cancel / close / report links fixed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCOUT_DRONE_MAX_LEG_TILES } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderScoutDroneDock } from "./client-scout-drone-dock.js";
import { renderScoutDroneHud } from "./client-scout-drone-hud.js";
import { cancelScoutPlan, clientScoutWorld, scoutPlanPreview } from "./client-scout-drone-plan.js";
import { scoutPlanNote } from "./client-scout-drone-plan-note.js";
import { createScoutGhostHoverGate } from "./client-scout-drone-plan-ghost.js";
import { scoutPlanRangeEdge, scoutRangeEdge, scoutRangeOrigins } from "./client-scout-drone-range.js";
import { reportedPlaces, scoutReportChipPlaces } from "./client-scout-drone-find-places.js";
import { isCaptureCardGhostTap, resetCaptureCardGhostTapForTests } from "../client-capture-effects/client-capture-ghost-tap.js";
import { drawScoutRange2D } from "../client-map-render-2d-scout-range/client-map-render-2d-scout-range.js";

const planningState = (stops: Array<{ x: number; y: number }>) => {
  const state = createInitialState();
  state.me = "me";
  state.tiles.set("50,50", { x: 50, y: 50, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile);
  state.scoutDronePicking = { active: true, stops, bumpAt: 0, shakeAt: 0, launches: 0 };
  return state;
};

afterEach(() => resetCaptureCardGhostTapForTests());

describe("Blocked and moved stops say why", () => {
  it("names the rival border that blocks the plan before any fog", () => {
    const state = planningState([{ x: 50, y: 56 }]);
    state.tiles.set("50,51", { x: 50, y: 51, terrain: "LAND", ownerId: "rival" } as Tile);
    state.playerNames.set("rival", "Rosa's Garden II");
    const deps = { send: vi.fn(() => true), rerender: vi.fn(), now: () => 0 };
    renderScoutDroneDock(state, deps);
    expect(document.querySelector("#scout-drone-dock .sd-go")!.textContent).toBe("Blocked");
    expect(document.querySelector("#scout-drone-dock .sd-note")!.textContent).toBe("Blocked · Rosa's Garden II border");
    cancelScoutPlan(state);
    renderScoutDroneDock(state, deps);
  });

  it("says a stop past the range was moved to the limit, and a stop short of a border why", () => {
    const far = planningState([{ x: 50, y: 50 + SCOUT_DRONE_MAX_LEG_TILES + 8 }]);
    expect(scoutPlanNote(scoutPlanPreview(far, far.scoutDronePicking.stops, 0), far.scoutDronePicking.stops, () => undefined)).toBe("Stop moved · range limit");
    const walled = planningState([{ x: 50, y: 60 }]);
    walled.tiles.set("50,55", { x: 50, y: 55, terrain: "LAND", ownerId: "rival" } as Tile);
    expect(scoutPlanNote(scoutPlanPreview(walled, walled.scoutDronePicking.stops, 0), walled.scoutDronePicking.stops, () => undefined)).toBe("Stop moved · rival border");
    const fine = planningState([{ x: 50, y: 55 }]);
    expect(scoutPlanNote(scoutPlanPreview(fine, fine.scoutDronePicking.stops, 0), fine.scoutDronePicking.stops, () => undefined)).toBeUndefined();
  });
});

describe("the range limit is drawn while planning", () => {
  it("rings the tiles where a leg from the start reaches its limit", () => {
    const state = planningState([]);
    const edge = scoutRangeEdge({ x: 50, y: 50 }, clientScoutWorld(state));
    expect(edge.length).toBeGreaterThan(40);
    for (const tile of edge) expect(Math.max(Math.abs(tile.x - 50), Math.abs(tile.y - 50))).toBe(SCOUT_DRONE_MAX_LEG_TILES);
  });

  it("starts the ring at the AFC before the first stop, at the last stop after, and draws none once no stop can be added", () => {
    const state = planningState([]);
    expect(scoutRangeOrigins(state, 0)).toEqual([{ x: 50, y: 50 }]);
    state.scoutDronePicking.stops = [{ x: 50, y: 55 }];
    expect(scoutRangeOrigins(state, 0)).toEqual([{ x: 50, y: 55 }]);
    state.tiles.set("50,52", { x: 50, y: 52, terrain: "LAND", ownerId: "rival" } as Tile);
    state.tilesRevision += 1;
    expect(scoutRangeOrigins(state, 0)).toEqual([]);
    state.scoutDronePicking.active = false;
    expect(scoutPlanRangeEdge(state, 0)).toEqual([]);
  });

  it("draws the ring on the 2D canvas", () => {
    const state = planningState([]);
    const ctx = { canvas: { width: 4000, height: 4000 }, save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), globalAlpha: 1, fillStyle: "" } as unknown as CanvasRenderingContext2D;
    const drawn = drawScoutRange2D(ctx, state, (x, y) => ({ sx: x * 20, sy: y * 20 }), 20, 0);
    expect(drawn).toBe(scoutPlanRangeEdge(state, 0).length);
    expect(drawn).toBeGreaterThan(0);
  });
});

describe("a reopened plan keeps nothing of the cancelled one", () => {
  it("draws no ghost leg to the old stop until the pointer moves", () => {
    const gate = createScoutGhostHoverGate();
    const oldStop = { x: 50, y: 58 };
    expect(gate(true, 1, oldStop)).toBe(false); // the stop just tapped
    expect(gate(false, 0, oldStop)).toBe(false); // Cancel
    expect(gate(true, 0, oldStop)).toBe(false); // reopened: the pointer is still on the old stop
    expect(gate(true, 0, { x: 51, y: 58 })).toBe(true); // it moved
    expect(gate(true, 0, oldStop)).toBe(true);
  });
});

describe("closing the report card", () => {
  it("swallows a map tap where the card was, so it never starts a new plan", () => {
    const state = createInitialState();
    state.me = "me";
    state.authSessionReady = true;
    state.mapPrep = null;
    state.changelog.open = false;
    state.scoutDroneReport = { targetX: 12, targetY: 4, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], at: 1_000 };
    renderScoutDroneHud(state, { send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 2_000 });
    const card = document.getElementById("scout-report-card")!;
    card.getBoundingClientRect = () => ({ left: 100, top: 600, right: 300, bottom: 680, width: 200, height: 80, x: 100, y: 600, toJSON: () => ({}) });
    (card.querySelector(".srs-close") as HTMLButtonElement).click();
    expect(state.scoutDroneReport).toBeUndefined();
    expect(isCaptureCardGhostTap(150, 640, Date.now())).toBe(true);
    expect(isCaptureCardGhostTap(150, 200, Date.now())).toBe(false);
  });
});

describe("report links pin the reported place", () => {
  const linkState = () => {
    const state = createInitialState();
    state.me = "me";
    for (let x = 0; x <= 5; x += 1) state.tiles.set(`${x},0`, { x, y: 0, terrain: "LAND", ownerId: "me" } as Tile);
    return state;
  };

  it("skips the player's own land and leads with tiles clear of it", () => {
    const state = linkState();
    expect(reportedPlaces(state, [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 4 }])).toEqual([{ x: 2, y: 4 }, { x: 2, y: 1 }]);
  });

  it("pins an empire's land clear of the player's, not the first tile seen pressed into their border", () => {
    const state = linkState();
    // The mid-flight find is the first tile seen: right on the player's border.
    state.scoutDroneFinds = { launchedAt: 1, all: [{ kind: "empire", x: 3, y: 1 }] };
    const report = { targetX: 3, targetY: 0, sites: { towns: [{ x: 4, y: 0 }], docks: [], waystations: [], watchtowers: [], planetaryDefense: [], resources: {}, empires: { rival: [{ x: 3, y: 1 }, { x: 3, y: 5 }] } } };
    expect(scoutReportChipPlaces(state, report, { kind: "town" }, "empire")).toEqual([{ x: 3, y: 5 }]);
    // A town the player has taken since is not a place to show.
    expect(scoutReportChipPlaces(state, report, { kind: "town" }, "town")).toEqual([]);
  });
});

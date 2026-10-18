// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { requestSettlement } from "../client-queue-logic/client-queue-logic.js";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import type { Tile } from "../client-types.js";
import { createGarrisonManyFlow, type GarrisonManyFlow } from "./client-garrison-many.js";
import { GARRISON_MANY_LIMIT, garrisonTileReason, reviewGarrisonMany } from "./client-garrison-many-model.js";

const tile = (x: number): Tile => ({ x, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
let flow: GarrisonManyFlow;
const setup = (count = 3) => {
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  state.manpower = 2000;
  state.gold = 0;
  state.serverReach = new Set(Array.from({ length: count }, (_, x) => `${x},0`));
  for (let x = 0; x < count; x++) state.tiles.set(`${x},0`, tile(x));
  const renderHud = vi.fn();
  const sendGameMessage = vi.fn(() => true);
  const pushFeed = vi.fn();
  const slots = vi.fn(() => ({ busy: 0, limit: 2, available: 2 }));
  const request = vi.fn((x: number, y: number, opts: { forceQueue: true; suppressWarnings: true }) => requestSettlement(state, x, y, {
    keyFor: (x, y) => `${x},${y}`, renderHud, pushFeed, showCaptureAlert: vi.fn(),
    developmentSlotSummary: slots, developmentSlotReason: () => "Busy", sendGameMessage,
    syncOptimisticSettlementTile: vi.fn(), opts,
    queueDevelopmentAction: (entry) => queueDevelopmentAction(state, entry, { renderHud, sendGameMessage, pushFeed })
  }));
  const process = vi.fn();
  flow = createGarrisonManyFlow(state, {
    keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y,
    hideTileActionMenu: vi.fn(), renderHud, developmentSlotSummary: slots,
    requestSettlement: request, processDevelopmentQueue: process, pushFeed
  });
  flow.begin(state.tiles.get("0,0")!);
  return { state, request, process, sendGameMessage, slots };
};
const click = (action: string): void => {
  const button = document.querySelector<HTMLButtonElement>(`[data-garrison="${action}"]`);
  expect(button).not.toBeNull();
  button!.click();
};
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { flow?.cancel(); vi.useRealTimers(); document.body.innerHTML = ""; });

describe("Garrison Many selection and real development queue", () => {
  it("starts with one tile; edits and reviews without spending; confirms exactly that selection", () => {
    const { state, request, process } = setup();
    expect(state.garrisonMany.keys).toEqual(["0,0"]);
    flow.select(1, 0); flow.select(0, 0); flow.select(2, 0);
    click("review");
    expect(document.body.textContent).toContain("40 manpower");
    expect(document.body.textContent).toContain("up to 2 start");
    expect(request).not.toHaveBeenCalled();
    expect(state.developmentQueue).toEqual([]);
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["1,0", "2,0"]);
    expect(state.manpower).toBe(2000); // the dispatcher pays later
    expect(process).toHaveBeenCalledOnce();
    expect(state.garrisonMany.active).toBe(false);
    expect(document.querySelector(".garrison-many-sheet")).toBeNull();
  });
  it("cancels from review or Escape without issuing any command", () => {
    const { state, request, sendGameMessage } = setup();
    click("review");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.garrisonMany.keys).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(sendGameMessage).not.toHaveBeenCalled();
  });
  it("blocks combined costs and reserves existing queued garrisons", () => {
    const { state, request } = setup();
    state.manpower = 40;
    state.developmentQueue.push({ kind: "SETTLE", tileKey: "10,0", x: 10, y: 0, label: "Existing" });
    flow.select(1, 0); click("review");
    expect(document.body.textContent).toContain("Need 60 manpower");
    expect(document.querySelector<HTMLButtonElement>('[data-garrison="confirm"]')!.disabled).toBe(true);
    click("confirm"); expect(request).not.toHaveBeenCalled();
  });
  it("requires a fresh confirmation when a selected tile is lost after review", () => {
    const { state, request } = setup();
    flow.select(1, 0); click("review");
    state.tiles.get("1,0")!.ownerId = "enemy";
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("excluded: Not your land");
    expect(state.garrisonMany.invalidKeys).toEqual(["1,0"]);
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["0,0"]);
  });
  it("requires another review for changed reach, manpower or queue capacity", () => {
    const { state, request } = setup();
    flow.select(1, 0); click("review");
    state.manpower = 20;
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Need 40 manpower");
    expect(reviewGarrisonMany(state, 0).canStart).toBe(0);
  });
  it("shows queue capacity and requires review when another entry appears", () => {
    const { state, request } = setup();
    flow.select(1, 0); click("review");
    state.developmentQueue.push({ kind: "SETTLE", tileKey: "10,0", x: 10, y: 0, label: "Existing" });
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("up to 0 start");
    while (state.developmentQueue.length < GARRISON_MANY_LIMIT) state.developmentQueue.push({ kind: "SETTLE", tileKey: `${state.developmentQueue.length + 10},0`, x: 10, y: 0, label: "Existing" });
    expect(reviewGarrisonMany(state, 2).blocked).toContain("room for 0");
  });
  it("invalidates a reviewed tile whose reach changes, without sending it", () => {
    const { state, request } = setup();
    flow.select(1, 0); click("review");
    state.serverReach!.delete("1,0");
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("excluded: Outside your reach");
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["0,0"]);
  });
  it("does not confirm an old selection immediately after disconnect", () => {
    const { state, request } = setup();
    click("review"); state.authSessionReady = false;
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(state.garrisonMany.active).toBe(false);
  });
  it("adds connected eligible tiles with a hard limit and supports clear", () => {
    const { state } = setup(GARRISON_MANY_LIMIT + 5);
    click("connected");
    expect(state.garrisonMany.keys).toHaveLength(GARRISON_MANY_LIMIT);
    expect(document.body.textContent).toContain("60-tile limit");
    click("clear");
    expect(state.garrisonMany.keys).toEqual([]);
  });
  it("rejects unreachable and already queued tiles but allows reach-exempt docks", () => {
    const { state } = setup();
    state.serverReach = new Set(["0,0"]);
    flow.select(1, 0);
    expect(state.garrisonMany.keys).toEqual(["0,0"]);
    expect(document.body.textContent).toContain("Outside your reach");
    state.tiles.get("1,0")!.dockId = "dock";
    expect(garrisonTileReason(state, state.tiles.get("1,0"))).toBe("");
    flow.select(1, 0);
    state.developmentQueue.push({ kind: "SETTLE", tileKey: "2,0", x: 2, y: 0, label: "Existing" });
    expect(garrisonTileReason(state, state.tiles.get("2,0"))).toBe("Garrison already queued");
    expect(state.garrisonMany.keys).toEqual(["0,0", "1,0"]);
  });
  it.each(["disconnect", "account", "season", "join", "space"])("clears selection on %s", (change) => {
    const { state, request } = setup();
    if (change === "disconnect") state.authSessionReady = false;
    if (change === "account") state.me = "other";
    if (change === "season") state.cameraRestoredSeasonId = "new-season";
    if (change === "join") state.needsSeasonJoin = true;
    if (change === "space") state.activeScreen = "space";
    vi.advanceTimersByTime(250);
    expect(state.garrisonMany.active).toBe(false);
    expect(document.querySelector(".garrison-many-sheet")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

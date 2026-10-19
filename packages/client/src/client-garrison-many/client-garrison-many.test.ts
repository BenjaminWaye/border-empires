// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { requestSettlement } from "../client-queue-logic/client-queue-logic.js";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import type { Tile } from "../client-types.js";
import { createGarrisonManyFlow, type GarrisonManyFlow } from "./client-garrison-many.js";
import { GARRISON_MANY_LIMIT, garrisonTileReason, buildGarrisonManyPlan } from "./client-garrison-many-model.js";

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
    keyFor: (x, y) => `${x},${y}`,
    hideTileActionMenu: vi.fn(), renderHud,
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
  it("offers direct confirmation and cancellation while the selection stays editable", () => {
    const { state, request } = setup();
    expect(Array.from(document.querySelectorAll(".garrison-many-sheet button")).map((button) => button.textContent)).toEqual(["Confirm", "Cancel"]);
    flow.select(1, 0); flow.select(0, 0); flow.select(2, 0);
    expect(document.body.textContent).toContain("40 manpower");
    expect(request).not.toHaveBeenCalled();
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["1,0", "2,0"]);
  });
  it("keeps only selection count, cost, instructions and confirmation controls", () => {
    setup();
    const sheet = document.querySelector(".garrison-many-sheet")!;
    expect(sheet.textContent).toContain("1 selected · 20 manpower");
    expect(sheet.querySelector("details, summary, ul")).toBeNull();
    expect(sheet.textContent).not.toMatch(/eligible|waiting|Review|Edit selection|Select connected|free slots/);
  });
  it.each(["cancel", "escape"])("exits with %s without spending or queuing", (action) => {
    const { state, request, sendGameMessage } = setup();
    flow.select(1, 0);
    if (action === "cancel") click("cancel");
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.garrisonMany.keys).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(state.manpower).toBe(2000);
  });
  it("disables confirmation when every tile has been deselected", () => {
    const { state, request } = setup();
    flow.select(0, 0);
    expect(document.body.textContent).toContain("0 selected · 0 manpower");
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(state.garrisonMany.active).toBe(true);
  });
  it("blocks combined costs and reserves existing queued garrisons", () => {
    const { state, request } = setup();
    state.manpower = 40;
    state.developmentQueue.push({ kind: "SETTLE", tileKey: "10,0", x: 10, y: 0, label: "Existing" });
    flow.select(1, 0);
    expect(document.body.textContent).toContain("Need 60 manpower");
    expect(document.querySelector<HTMLButtonElement>('[data-garrison="confirm"]')!.disabled).toBe(true);
    click("confirm"); expect(request).not.toHaveBeenCalled();
  });
  it("blocks a lost tile at confirmation until it is deselected, without silently queuing a subset", () => {
    const { state, request } = setup();
    flow.select(1, 0);
    state.tiles.get("1,0")!.ownerId = "enemy";
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(state.garrisonMany.invalidKeys).toEqual(["1,0"]);
    expect(document.body.textContent).toContain("Deselect the orange tile");
    flow.select(1, 0);
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["0,0"]);
  });
  it("rechecks affordability on confirm and enables confirmation after resources recover", () => {
    const { state, request } = setup();
    flow.select(1, 0);
    state.manpower = 20;
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Need 40 manpower");
    state.manpower = 40;
    vi.advanceTimersByTime(250);
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["0,0", "1,0"]);
  });
  it("does not add another confirmation step when existing queued work changes but the selection remains valid", () => {
    const { state } = setup();
    flow.select(1, 0);
    state.developmentQueue.push({ kind: "SETTLE", tileKey: "10,0", x: 10, y: 0, label: "Existing" });
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["10,0", "0,0", "1,0"]);
  });
  it("blocks confirmation if the queue has filled since the last map tap", () => {
    const { state, request } = setup();
    flow.select(1, 0);
    while (state.developmentQueue.length < GARRISON_MANY_LIMIT) state.developmentQueue.push({ kind: "SETTLE", tileKey: `${state.developmentQueue.length + 10},0`, x: 10, y: 0, label: "Existing" });
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(buildGarrisonManyPlan(state).blocked).toContain("room for 0");
  });
  it("blocks a tile whose reach changes until the player deselects it", () => {
    const { state, request } = setup();
    flow.select(1, 0);
    state.serverReach!.delete("1,0");
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(state.garrisonMany.invalidKeys).toEqual(["1,0"]);
    flow.select(1, 0);
    click("confirm");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(["0,0"]);
  });
  it("does not confirm immediately after disconnect", () => {
    const { state, request } = setup();
    state.authSessionReady = false;
    click("confirm");
    expect(request).not.toHaveBeenCalled();
    expect(state.garrisonMany.active).toBe(false);
  });
  it("bounds manual selections and allows individual deselection at the cap", () => {
    const { state } = setup(GARRISON_MANY_LIMIT + 1);
    for (let x = 1; x <= GARRISON_MANY_LIMIT; x++) flow.select(x, 0);
    expect(state.garrisonMany.keys).toHaveLength(GARRISON_MANY_LIMIT);
    expect(document.body.textContent).toContain("Select up to 60 tiles");
    flow.select(0, 0);
    expect(state.garrisonMany.keys).toHaveLength(GARRISON_MANY_LIMIT - 1);
    flow.select(GARRISON_MANY_LIMIT, 0);
    expect(state.garrisonMany.keys).toHaveLength(GARRISON_MANY_LIMIT);
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

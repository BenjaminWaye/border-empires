import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuProgressView, TileMenuView } from "../client-types.js";
import { townScreenRegions } from "./client-hud-v2-town.js";
import { runTownWorkAction, townWorkHtml, workName } from "./client-hud-v2-town-work.js";

const queued: TileMenuProgressView = {
  title: "Hydrogarden queued", detail: "", remainingLabel: "Queued", progress: 0, note: "",
  cancelLabel: "Cancel queued build", cancelActionId: "cancel_queued_build", queueState: "queued",
  secondaryLabel: "Jump to front of queue", secondaryActionId: "move_queued_entry_to_front"
};
const building: TileMenuProgressView = {
  title: "Fortification under construction", detail: "", remainingLabel: "1h 12m", progress: 0.58, note: "",
  cancelLabel: "Cancel construction", rushBuyLabel: "Rush · 340 Coin", rushBuyActionId: "rush_buy"
};

const view = (over: Partial<TileMenuView>): TileMenuView => ({ title: "Halveth (5, 5)", subtitle: "", tabs: ["actions"], overviewLines: [], actions: [], buildings: [], crystal: [], ...over });
const act = (id: TileActionDef["id"], over: Partial<TileActionDef> = {}): TileActionDef => ({ id, label: id, ...over });
const town = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "Halveth", type: "MARKET", population: 50, populationTier: "TOWN" } } as unknown as Tile;
const support: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
const regions = (focusView: TileMenuView, buildSelection?: string) =>
  townScreenRegions({ town, focus: support, townView: view({}), focusView, townIndex: 0, townCount: 1, buildSelection, category: undefined, focusQueuePosition: 3 });

describe("town screen work cards", () => {
  it("names the building and shows a queued build's place with Jump to front and Cancel", () => {
    const html = townWorkHtml([queued], "6,5", 3);
    expect(workName(queued)).toBe("Hydrogarden");
    expect(html).toContain("Queued · #3");
    expect(html).toContain('data-v2-work-action="move_queued_entry_to_front" data-target-key="6,5"');
    expect(html).toContain('data-v2-work-action="cancel_queued_build" data-target-key="6,5"');
    expect(html).not.toContain("v2t-job-bar");
  });

  it("shows construction with time left, a progress bar, Rush and Cancel", () => {
    const html = townWorkHtml([building], "6,5", 0);
    expect(html).toContain("Fortification");
    expect(html).toContain("1h 12m");
    expect(html).toContain('style="width:58%"');
    expect(html).toContain('data-v2-work-action="rush_buy"');
    expect(html).toContain('data-v2-work-action="cancel_structure_build"');
    expect(html).not.toContain("move_queued_entry_to_front");
  });

  // Regression: a support tile with a queued build opened the town screen on
  // "Nothing to build on this tile", with no way to see or reorder the build.
  it("titles the panel In progress and lists the tile's work instead of the empty text", () => {
    const { build } = regions(view({ work: [queued] }));
    expect(build).toContain('<span class="v2t-build-title">In progress</span>');
    expect(build).toContain("Hydrogarden");
    expect(build).toContain("move_queued_entry_to_front");
    expect(build).not.toContain("Nothing to build");
    expect(build).not.toContain('<div class="v2t-h">Build</div>');
  });

  it("keeps what the tile can still take under its own Build heading", () => {
    const { build } = regions(view({ work: [building], buildings: [act("build_hydrogarden", { label: "Hydrogarden" })] }));
    expect(build).toContain("In progress");
    expect(build).toContain('<div class="v2t-h">Build</div>');
    expect(build.indexOf("v2t-work")).toBeLessThan(build.indexOf("v2t-build-list"));
  });

  it("stays a plain Build panel when nothing is running or queued", () => {
    const { build } = regions(view({ buildings: [act("build_hydrogarden", { label: "Hydrogarden" })] }));
    expect(build).toContain('<span class="v2t-build-title">Build</span>');
    expect(build).not.toContain("v2t-work");
  });

  it("docks the picked building's Build on button inside the build panel", () => {
    const { build } = regions(view({ buildings: [act("build_hydrogarden", { label: "Hydrogarden" })] }), "build_hydrogarden");
    expect(build).toContain('class="v2t-place v2t-place-docked"');
    expect(build).toContain("Build on (6, 5)");
    expect(regions(view({ buildings: [act("build_hydrogarden")] })).build).not.toContain("v2t-place");
  });
});

describe("runTownWorkAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves the tile's queued build to the front and tells the server", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k), clear: () => values.clear() });
    const state = createInitialState();
    state.me = "me";
    state.developmentQueue = [
      { kind: "SETTLE", x: 1, y: 1, tileKey: "1,1", label: "Garrison at (1, 1)" },
      { kind: "BUILD", x: 6, y: 5, tileKey: "6,5", label: "Build Hydrogarden at (6, 5)", payload: { type: "BUILD_STRUCTURE", x: 6, y: 5, structureType: "HYDROGARDEN" }, optimisticKind: "HYDROGARDEN" }
    ] as typeof state.developmentQueue;
    const sendGameMessage = vi.fn(() => true);

    expect(runTownWorkAction({ state, renderHud: () => {}, sendGameMessage }, "move_queued_entry_to_front", "6,5")).toBe(true);

    expect(state.developmentQueue[0]?.tileKey).toBe("6,5");
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DEV_QUEUE_MOVE_TO_FRONT", tileKey: "6,5" });
  });

  it("sends rush and cancel construction for the tile's coordinates", () => {
    const sendGameMessage = vi.fn(() => true);
    const deps = { state: createInitialState(), renderHud: () => {}, sendGameMessage };
    runTownWorkAction(deps, "rush_buy", "6,5");
    runTownWorkAction(deps, "cancel_structure_build", "6,5");
    expect(sendGameMessage).toHaveBeenNthCalledWith(1, { type: "RUSH_BUY", x: 6, y: 5 });
    expect(sendGameMessage).toHaveBeenNthCalledWith(2, { type: "CANCEL_STRUCTURE_BUILD", x: 6, y: 5 });
    expect(runTownWorkAction(deps, "launch_attack", "6,5")).toBe(false);
  });
});

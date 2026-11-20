import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "./client-state/client-state.js";
import { queueDevelopmentAction } from "./client-development-queue/client-development-queue.js";
import { handleGenericBuildAction } from "./client-generic-build-action.js";
import { buildPlacedPresses } from "./client-queue-logic/client-build-placed-feedback.js";
import type { Tile, TileMenuView } from "./client-types.js";

type QueueEntry = ReturnType<typeof createInitialState>["developmentQueue"][number];

// Regression (staging 2026-11-20): a Farm Plot built on a town's support tile went straight onto the paced
// development queue without counting as a Place press, so the town screen's Place never showed "✓ Queued"
// or "Place another" after Build here / Place.
describe("support-plot build counts as a Place press", () => {
  const setup = (disabled = false) => {
    const state = createInitialState();
    state.me = "me";
    const plot: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
    const view = { buildings: [{ id: "build_farm_plot", label: "Build Farm Plot", disabled }], actions: [] } as unknown as TileMenuView;
    const pushFeed = vi.fn();
    const run = () => handleGenericBuildAction({
      state, selected: plot, actionId: "build_farm_plot", viewForTile: () => view, handleBuildAction: vi.fn(), pushFeed, hideMenu: vi.fn(),
      queueDevelopmentAction: (entry: QueueEntry) => queueDevelopmentAction(state, entry, { renderHud: vi.fn(), pushFeed: vi.fn() })
    });
    return { state, pushFeed, run };
  };

  it("announces the queued build, so Place can confirm it", () => {
    const { state, pushFeed, run } = setup();
    const before = buildPlacedPresses().count;
    run();
    expect(state.developmentQueue).toHaveLength(1);
    expect(buildPlacedPresses()).toEqual({ count: before + 1, outcome: "queued" });
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("Build Farm Plot at (6, 5)"), "info", "success");
  });

  it("stays silent when the row is disabled and nothing is queued", () => {
    const { state, pushFeed, run } = setup(true);
    const before = buildPlacedPresses().count;
    run();
    expect(state.developmentQueue).toHaveLength(0);
    expect(buildPlacedPresses().count).toBe(before);
    expect(pushFeed).not.toHaveBeenCalled();
  });
});

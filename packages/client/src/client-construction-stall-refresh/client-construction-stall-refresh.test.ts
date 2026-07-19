import { describe, expect, it, vi } from "vitest";

import { createStalledConstructionRefresher } from "./client-construction-stall-refresh.js";
import type { Tile } from "../client-types.js";

const tile = { x: 1, y: 1 } as Tile;

describe("createStalledConstructionRefresher", () => {
  it("does not request a refresh while construction still has time remaining", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const refresh = createStalledConstructionRefresher({ requestTileDetailIfNeeded });
    refresh(tile, "1,1", 5_000);
    expect(requestTileDetailIfNeeded).not.toHaveBeenCalled();
  });

  it("forces a REQUEST_TILE_DETAIL once the countdown hits 0, so a dropped/missed completion delta gets reconciled", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const refresh = createStalledConstructionRefresher({ requestTileDetailIfNeeded });
    refresh(tile, "1,1", 0);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(1);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledWith(tile, { force: true });
  });

  it("throttles repeat forced refreshes for the same tile within the throttle window", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const refresh = createStalledConstructionRefresher({ requestTileDetailIfNeeded, throttleMs: 10_000 });
    refresh(tile, "1,1", 0);
    refresh(tile, "1,1", 0);
    refresh(tile, "1,1", 0);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(1);
  });

  it("resets the throttle for a tile once its countdown shows time remaining again (e.g. a fresh build)", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const refresh = createStalledConstructionRefresher({ requestTileDetailIfNeeded, throttleMs: 10_000 });
    refresh(tile, "1,1", 0);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(1);
    refresh(tile, "1,1", 30_000);
    refresh(tile, "1,1", 0);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(2);
  });

  it("throttles independently per tile key", () => {
    const requestTileDetailIfNeeded = vi.fn();
    const refresh = createStalledConstructionRefresher({ requestTileDetailIfNeeded, throttleMs: 10_000 });
    refresh(tile, "1,1", 0);
    refresh(tile, "2,2", 0);
    expect(requestTileDetailIfNeeded).toHaveBeenCalledTimes(2);
  });
});

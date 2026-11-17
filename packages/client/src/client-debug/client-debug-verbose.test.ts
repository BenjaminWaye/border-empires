import { afterEach, describe, expect, it, vi } from "vitest";

import { verboseTileDebugEnabled } from "./client-debug.js";

describe("verboseTileDebugEnabled", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads localStorage at most once a second, since the draw loop asks for every tile on every frame", () => {
    const store = new Map<string, string>();
    const getItem = vi.fn((key: string) => store.get(key) ?? null);
    vi.stubGlobal("window", { localStorage: { getItem } });

    const t0 = 1_000_000;
    expect(verboseTileDebugEnabled(t0)).toBe(false);
    for (let i = 0; i < 5_000; i += 1) verboseTileDebugEnabled(t0 + i / 10);
    expect(getItem).toHaveBeenCalledTimes(1);

    store.set("tile-debug-verbose", "1");
    expect(verboseTileDebugEnabled(t0 + 999)).toBe(false);
    expect(verboseTileDebugEnabled(t0 + 1_000)).toBe(true);
    expect(getItem).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createEndedSeasonTileCache } from "./ended-season-tiles.js";

describe("ended-season overview sharing across players", () => {
  const season = { seasonId: "season-41", status: "ended" as const };
  const normalize = () => [{ x: 0, y: 0, terrain: "LAND" as const }];

  it("normalizes a full frozen world once and shares it across subscriptions", () => {
    const cache = createEndedSeasonTileCache(1);
    const build = vi.fn(normalize);
    const first = cache.read(season, 1, build);
    expect(cache.read(season, 1, build)).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("does not mistake omitted tiles for a full-world reply", () => {
    const cache = createEndedSeasonTileCache(1);
    const first = cache.read(season, 1, normalize);
    expect(cache.read(season, 0, () => [])).toEqual([]);
    expect(cache.read(season, 1, normalize)).toBe(first);
  });

  it("replaces the retained world on a new season and never shares live views", () => {
    const cache = createEndedSeasonTileCache(1);
    const first = cache.read(season, 1, normalize);
    const next = { ...season, seasonId: "season-42" };
    const second = cache.read(next, 1, normalize);
    expect(second).not.toBe(first);
    expect(cache.read(next, 1, normalize)).toBe(second);
    const active = { ...next, status: "active" as const };
    expect(cache.read(active, 1, normalize)).not.toBe(cache.read(active, 1, normalize));
    expect(cache.read(next, 1, normalize)).not.toBe(second);
  });
});

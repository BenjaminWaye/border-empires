/**
 * Tests for:
 *  Fix 1 — autopilots stop at season end and restart on rollover
 *  Fix 2 — post-season proto-tile cache in SubscribePlayer
 *
 * Strategy: source-text assertions (like fog-subscribe-regression.test.ts)
 * plus unit tests of the metrics layer that the cache path exercises.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSimulationMetrics } from "../metrics/metrics.js";
import { AI_TICK_THROTTLE_REASONS } from "../metrics/metrics-types.js";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "simulation-service.ts"), "utf8");
};

// ─── Fix 1: autopilot lifecycle ──────────────────────────────────────────────

describe("Fix 1 — autopilots stop on season end and restart on rollover", () => {
  it("calls closeAutopilots() immediately after crownedWinner is detected", () => {
    const file = source();
    // The crownedWinner block must call closeAutopilots before warmSeasonEndSnapshots
    // so that no AI/system ticks fire during the post-season snapshot warming.
    expect(file).toContain(
      [
        "if (trackerResult.crownedWinner) {",
        "      clearCachedSnapshots();",
        "      closeAutopilots();",
        '      log.info("autopilots stopped on season end");',
        "      warmSeasonEndSnapshots();"
      ].join("\n")
    );
  });

  it("restarts autopilots on season rollover via replaceRuntime → startAutopilots", () => {
    const file = source();
    // replaceRuntime is the only code path that transitions to a new season.
    // It must call startAutopilots() to re-enable AI for the new season.
    // Extract the replaceRuntime body and confirm startAutopilots is inside it.
    const replaceRuntimeStart = file.indexOf("const replaceRuntime = ({");
    const replaceRuntimeEnd = file.indexOf("\n  };", replaceRuntimeStart) + 5;
    const replaceRuntimeBlock = file.slice(replaceRuntimeStart, replaceRuntimeEnd);
    expect(replaceRuntimeBlock).toContain("startAutopilots()");
    // startAutopilots itself calls closeAutopilots first (idempotent guard).
    const startAutopilotsFn = file.slice(file.indexOf("const startAutopilots = ():"));
    expect(startAutopilotsFn.slice(0, 200)).toContain("closeAutopilots()");
  });

  it("aiShouldRun returns false and increments season_ended counter when season is ended", () => {
    const file = source();
    // Belt-and-suspenders guard at the top of aiShouldRun
    expect(file).toContain(
      [
        "  const aiShouldRun = () => {",
        '    if (currentSeasonState.status === "ended") {',
        '      simulationMetrics.incrementSimAiTickThrottled("season_ended");',
        "      return false;",
        "    }"
      ].join("\n")
    );
  });

  it("systemShouldRun returns false and increments season_ended counter when season is ended", () => {
    const file = source();
    // Belt-and-suspenders guard at the top of systemShouldRun
    expect(file).toContain(
      [
        "  const systemShouldRun = () => {",
        '    if (currentSeasonState.status === "ended") {',
        '      simulationMetrics.incrementSimAiTickThrottled("season_ended");',
        "      return false;",
        "    }"
      ].join("\n")
    );
  });

  it("season_ended is a valid AiTickThrottleReason registered in the const tuple", () => {
    // If this fails the metrics counter call won't typecheck and the counter
    // won't appear in Prometheus output.
    expect(AI_TICK_THROTTLE_REASONS).toContain("season_ended");
  });

  it("simulationMetrics records season_ended throttle increments correctly", () => {
    const metrics = createSimulationMetrics();
    const before = metrics.snapshot().simAiTickThrottledTotal;
    expect(before["season_ended"]).toBe(0);

    metrics.incrementSimAiTickThrottled("season_ended");
    metrics.incrementSimAiTickThrottled("season_ended");
    const after = metrics.snapshot().simAiTickThrottledTotal;
    expect(after["season_ended"]).toBe(2);

    // Other reasons must be unaffected
    expect(after["budget"]).toBe(0);
    expect(after["loop_lag"]).toBe(0);
  });
});

// ─── Fix 2: post-season proto-tile cache ─────────────────────────────────────

describe("Fix 2 — post-season proto-tile cache in SubscribePlayer", () => {
  it("SubscribePlayer uses the proto-tile cache when season is ended", () => {
    const file = source();
    // Cache hit path: read local `cached` variable to allow TypeScript narrowing
    expect(file).toContain(
      [
        '                if (currentSeasonState.status === "ended") {',
        "                  const cached = postSeasonProtoTilesCache;",
        "                  if (cached !== undefined && cached.seasonId === currentSeasonState.seasonId) {",
        "                    simulationMetrics.incrementSimPostSeasonProtoTileCacheHit();",
        "                    return cached.tiles;"
      ].join("\n")
    );
  });

  it("SubscribePlayer populates the proto-tile cache on first season-ended call", () => {
    const file = source();
    // Cache miss path: map tiles, store, then increment miss counter
    expect(file).toContain(
      [
        "                  const mapped = snapshotPayload.tiles.map(toFullSnapshotProtoTile);",
        "                  postSeasonProtoTilesCache = { seasonId: currentSeasonState.seasonId, tiles: mapped };",
        "                  simulationMetrics.incrementSimPostSeasonProtoTileCacheMiss();"
      ].join("\n")
    );
  });

  it("clearCachedSnapshots invalidates the proto-tile cache", () => {
    const file = source();
    // clearCachedSnapshots is called on crown and on rollover; both must clear
    // the cache so a new season never serves stale tiles.
    const clearFn = file.slice(
      file.indexOf("const clearCachedSnapshots = () => {"),
      file.indexOf("const clearCachedSnapshots = () => {") + 200
    );
    expect(clearFn).toContain("postSeasonProtoTilesCache = undefined");
  });

  it("active-season SubscribePlayer path is unchanged (no cache branch)", () => {
    const file = source();
    // The active-season fallback must remain a direct .map() call without cache
    expect(file).toContain(
      "return snapshotPayload.tiles.map(toFullSnapshotProtoTile);"
    );
  });

  it("proto-tile cache counters start at zero and track hits/misses independently", () => {
    const metrics = createSimulationMetrics();
    const s0 = metrics.snapshot();
    expect(s0.simPostSeasonProtoTileCacheHitTotal).toBe(0);
    expect(s0.simPostSeasonProtoTileCacheMissTotal).toBe(0);

    metrics.incrementSimPostSeasonProtoTileCacheMiss();
    metrics.incrementSimPostSeasonProtoTileCacheHit();
    metrics.incrementSimPostSeasonProtoTileCacheHit();

    const s1 = metrics.snapshot();
    expect(s1.simPostSeasonProtoTileCacheMissTotal).toBe(1);
    expect(s1.simPostSeasonProtoTileCacheHitTotal).toBe(2);
  });

  it("FetchTileDetail path is NOT wrapped in the season-end cache (area query)", () => {
    const file = source();
    // The area-query call site must remain a plain .map() on its own tiles variable
    // (not snapshotPayload), so it does not share the full-snapshot cache.
    expect(file).toContain("tiles: tiles.map(toFullSnapshotProtoTile),");
  });
});

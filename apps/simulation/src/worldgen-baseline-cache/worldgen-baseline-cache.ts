import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import { generateSeasonWorld, type SimulationMapStyle, type SimulationRulesetId } from "../season-worldgen/season-worldgen.js";

// Memoise worldgen baselines per (rulesetId, worldSeed) so the snapshot
// store can compact saves and rehydrate loads without paying the 200k-tile
// generation cost more than once per seed per process.
//
// SQLite persistence layer: on first boot of a new season, generated tiles
// are written to a `worldgen_baselines` table. On subsequent restarts the
// table row is read instead of calling generateSeasonWorld, eliminating the
// 30-74s synchronous block that held the sim worker event loop hostage
// during startup recovery (root cause of the SERVER_STARTING cascade on
// staging sim-worker restarts).
export type WorldgenTiles = Awaited<ReturnType<typeof generateSeasonWorld>>["initialState"]["tiles"];

export const createWorldgenBaselineCache = async (options: {
  sqlitePath?: string;
  rulesetId?: SimulationRulesetId;
  log: Pick<Console, "error" | "info" | "warn">;
}) => {
  const { log, rulesetId } = options;
  const worldgenBaselineCache = new Map<string, WorldgenTiles>();

  let worldgenDb: import("node:sqlite").DatabaseSync | undefined;
  if (options.sqlitePath) {
    const { openSqliteDatabase } = await import("../sqlite-db.js");
    worldgenDb = openSqliteDatabase(options.sqlitePath);
    // Always run CREATE TABLE IF NOT EXISTS — idempotent, and must be present
    // even when applySchema is false (e.g. first deploy that adds this table).
    worldgenDb.exec(`
      CREATE TABLE IF NOT EXISTS worldgen_baselines (
        cache_key TEXT PRIMARY KEY,
        tiles_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  const readWorldgenBaselineFromDb = (cacheKey: string): WorldgenTiles | undefined => {
    if (!worldgenDb) return undefined;
    const row = worldgenDb
      .prepare(`SELECT tiles_json FROM worldgen_baselines WHERE cache_key = ?`)
      .get(cacheKey) as { tiles_json: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.tiles_json) as WorldgenTiles;
    } catch (err) {
      log.error({ err, cacheKey }, "worldgen_baselines row corrupt — falling back to cold generation");
      return undefined;
    }
  };

  const writeWorldgenBaselineToDb = (cacheKey: string, tiles: WorldgenTiles): void => {
    if (!worldgenDb) return;
    try {
      worldgenDb
        .prepare(`INSERT OR REPLACE INTO worldgen_baselines (cache_key, tiles_json, created_at) VALUES (?, ?, ?)`)
        .run(cacheKey, JSON.stringify(tiles), Date.now());
    } catch (err) {
      log.error({ err, cacheKey }, "failed to persist worldgen baseline to SQLite (non-fatal)");
    }
  };

  // Pre-warms resolveWorldgenBaseline's cache to avoid its cold-generation path.
  const warmWorldgenBaselineCache = (seasonState: SimulationSeasonState, tiles: WorldgenTiles): void => {
    const cacheKey = `${rulesetId}:${seasonState.worldSeed}:${seasonState.mapStyle ?? "continents"}`;
    worldgenBaselineCache.set(cacheKey, tiles);
    writeWorldgenBaselineToDb(cacheKey, tiles);
  };

  const resolveWorldgenBaseline = async (input: { rulesetId: string; worldSeed: number; mapStyle?: SimulationMapStyle }) => {
    if (input.rulesetId !== "seasonal-default") return [];
    // mapStyle is part of the cache key, not just an input to generation: the same
    // worldSeed with a different style produces a completely different tile set
    // (buildContinents vs buildIslands), and a stale hit here would silently
    // hand back the wrong topology.
    const cacheKey = `${input.rulesetId}:${input.worldSeed}:${input.mapStyle ?? "continents"}`;

    const inMemory = worldgenBaselineCache.get(cacheKey);
    if (inMemory) return inMemory;

    // SQLite persisted baseline survives sim-worker restarts — avoids the
    // 30-74s generateSeasonWorld block that previously held the event loop
    // hostage during startup recovery on every container restart.
    const t0 = Date.now();
    const persisted = readWorldgenBaselineFromDb(cacheKey);
    if (persisted) {
      worldgenBaselineCache.set(cacheKey, persisted);
      log.info({ cacheKey, durationMs: Date.now() - t0 }, "worldgen baseline loaded from SQLite cache (cold-start block eliminated)");
      return persisted;
    }

    // Cold generation: only on first boot of a brand-new season seed.
    log.info({ cacheKey }, "worldgen baseline not cached — running generateSeasonWorld (expected on first season boot only)");
    const genT0 = Date.now();
    const generated = await generateSeasonWorld(input.rulesetId as SimulationRulesetId, input.worldSeed, {
      ...(input.mapStyle ? { mapStyle: input.mapStyle } : {})
    });
    const tiles = generated.initialState.tiles;
    const genMs = Date.now() - genT0;
    log.info({ cacheKey, durationMs: genMs, tileCount: tiles.length }, "worldgen baseline generated — persisting to SQLite");
    worldgenBaselineCache.set(cacheKey, tiles);
    writeWorldgenBaselineToDb(cacheKey, tiles);
    return tiles;
  };

  return { resolveWorldgenBaseline, warmWorldgenBaselineCache };
};

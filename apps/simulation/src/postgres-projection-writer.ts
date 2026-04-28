/**
 * Writes per-checkpoint projection rows alongside world_snapshots.
 *
 * Projection tables (player_projection, tile_projection,
 * combat_lock_projection, visibility_projection) are fast read-model tables
 * that duplicate the information already inside the world_snapshots JSONB blob.
 * They let callers answer common queries without full blob deserialization.
 */

import type { RecoveredSimulationState } from "./event-recovery.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

type Queryable = {
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export type ProjectionExportState = {
  /** Full per-player export from runtime.exportState() */
  players: Array<{
    id: string;
    name?: string;
    points: number;
    manpower: number;
    manpowerCapSnapshot?: number;
    techIds: string[];
    domainIds: string[];
    strategicResources: Record<string, number>;
    allies: string[];
    vision: number;
    visionRadiusBonus: number;
    territoryTileKeys: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    strategicProductionPerMinute?: Record<string, number>;
  }>;
  /** Active combat locks from runtime.exportState() */
  activeLocks: Array<{
    commandId: string;
    playerId: string;
    originKey: string;
    targetKey: string;
    resolvesAt: number;
  }>;
};

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * Computes the set of visible tile keys for each player given their territory.
 * Mirrors the vision logic in player-snapshot.ts without the full snapshot
 * pipeline overhead.
 */
const buildVisibilityMap = (
  players: ProjectionExportState["players"],
  worldWidth: number = 200,
  worldHeight: number = 200,
  defaultVisionRadius: number = 3
): Map<string, string[]> => {
  const wrapX = (x: number): number => ((x % worldWidth) + worldWidth) % worldWidth;
  const wrapY = (y: number): number => ((y % worldHeight) + worldHeight) % worldHeight;
  const keyFor = (x: number, y: number): string => `${x},${y}`;
  const parseKey = (k: string): { x: number; y: number } | undefined => {
    const [rx, ry] = k.split(",");
    const x = Number(rx);
    const y = Number(ry);
    return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : undefined;
  };

  const playerById = new Map(players.map((p) => [p.id, p]));
  const result = new Map<string, string[]>();

  for (const player of players) {
    const visible = new Set<string>();
    const addVision = (tileKeys: string[], vision: number, bonus: number): void => {
      const radius = Math.max(1, Math.floor(defaultVisionRadius * vision) + bonus);
      for (const k of tileKeys) {
        const coords = parseKey(k);
        if (!coords) continue;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            visible.add(keyFor(wrapX(coords.x + dx), wrapY(coords.y + dy)));
          }
        }
      }
    };
    addVision(player.territoryTileKeys, player.vision, player.visionRadiusBonus);
    for (const allyId of player.allies) {
      const ally = playerById.get(allyId);
      if (ally) addVision(ally.territoryTileKeys, ally.vision, ally.visionRadiusBonus);
    }
    result.set(player.id, [...visible]);
  }

  return result;
};

/**
 * Refresh all current-state projection tables from one runtime export.
 * Call from within the checkpoint transaction for consistent compaction.
 */
export const writeCurrentProjections = async (
  db: Queryable,
  recoveredState: RecoveredSimulationState,
  exportedState: ProjectionExportState,
  updatedAt: number
): Promise<void> => {
  await db.query("TRUNCATE player_projection_current, tile_projection_current, combat_lock_projection_current, visibility_projection_current");
  await Promise.all([
    writePlayerProjection(db, exportedState.players, updatedAt),
    writeTileProjection(db, recoveredState.tiles, updatedAt),
    writeCombatLockProjection(db, exportedState.activeLocks, updatedAt),
    writeVisibilityProjection(db, exportedState.players, updatedAt)
  ]);
};

const writePlayerProjection = async (
  db: Queryable,
  players: ProjectionExportState["players"],
  updatedAt: number
): Promise<void> => {
  if (players.length === 0) return;

  const rows = players.map((p) => [
    p.id,
    p.name ?? null,
    p.points,
    p.manpower,
    p.manpowerCapSnapshot ?? null,
    JSON.stringify(p.techIds.sort()),
    JSON.stringify((p.domainIds ?? []).sort()),
    JSON.stringify(p.strategicResources ?? {}),
    JSON.stringify(p.allies.sort()),
    p.territoryTileKeys.length,
    p.settledTileCount ?? null,
    p.townCount ?? null,
    p.incomePerMinute ?? null,
    updatedAt
  ]);

  // Build a multi-row INSERT for performance
  const placeholders = rows
    .map(
      (_, i) =>
        `($${i * 14 + 1},$${i * 14 + 2},$${i * 14 + 3},$${i * 14 + 4},$${i * 14 + 5},$${i * 14 + 6}::jsonb,$${i * 14 + 7}::jsonb,$${i * 14 + 8}::jsonb,$${i * 14 + 9}::jsonb,$${i * 14 + 10},$${i * 14 + 11},$${i * 14 + 12},$${i * 14 + 13},$${i * 14 + 14})`
    )
    .join(",");
  const values = rows.flat();

  await db.query(
    `INSERT INTO player_projection_current (
       player_id,name,points,manpower,manpower_cap,
       tech_ids,domain_ids,strategic_resources,allies,
       territory_tile_count,settled_tile_count,town_count,income_per_minute,updated_at
     ) VALUES ${placeholders}`,
    values
  );
};

const writeTileProjection = async (
  db: Queryable,
  tiles: RecoveredSimulationState["tiles"],
  updatedAt: number
): Promise<void> => {
  if (tiles.length === 0) return;

  // Write in batches of 500 to stay within Postgres parameter limits
  const BATCH = 500;
  for (let offset = 0; offset < tiles.length; offset += BATCH) {
    const batch = tiles.slice(offset, offset + BATCH);
    const rows = batch.map((t) => [
      tileKeyOf(t.x, t.y),
      t.x,
      t.y,
      t.terrain,
      t.resource ?? null,
      t.dockId ?? null,
      t.ownerId ?? null,
      t.ownershipState ?? null,
      t.town ? JSON.stringify(t.town) : null,
      t.fort ? JSON.stringify(t.fort) : null,
      t.observatory ? JSON.stringify(t.observatory) : null,
      t.siegeOutpost ? JSON.stringify(t.siegeOutpost) : null,
      t.economicStructure ? JSON.stringify(t.economicStructure) : null,
      t.sabotage ? JSON.stringify(t.sabotage) : null,
      t.shardSite ? JSON.stringify(t.shardSite) : null,
      updatedAt
    ]);

    const placeholders = rows
      .map(
        (_, i) =>
          `($${i * 16 + 1},$${i * 16 + 2},$${i * 16 + 3},$${i * 16 + 4},$${i * 16 + 5},$${i * 16 + 6},$${i * 16 + 7},$${i * 16 + 8},$${i * 16 + 9}::jsonb,$${i * 16 + 10}::jsonb,$${i * 16 + 11}::jsonb,$${i * 16 + 12}::jsonb,$${i * 16 + 13}::jsonb,$${i * 16 + 14}::jsonb,$${i * 16 + 15}::jsonb,$${i * 16 + 16})`
      )
      .join(",");

    await db.query(
      `INSERT INTO tile_projection_current (
         tile_key,x,y,terrain,resource,dock_id,
         owner_id,ownership_state,town,fort,observatory,
         siege_outpost,economic_structure,sabotage,shard_site,updated_at
       ) VALUES ${placeholders}`,
      rows.flat()
    );
  }
};

const writeCombatLockProjection = async (
  db: Queryable,
  locks: ProjectionExportState["activeLocks"],
  updatedAt: number
): Promise<void> => {
  if (locks.length === 0) return;

  const rows = locks.map((l) => [l.commandId, l.playerId, l.originKey, l.targetKey, l.resolvesAt, updatedAt]);
  const placeholders = rows
    .map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`)
    .join(",");

  await db.query(
    `INSERT INTO combat_lock_projection_current (command_id,player_id,origin_key,target_key,resolves_at,updated_at)
     VALUES ${placeholders}`,
    rows.flat()
  );
};

const writeVisibilityProjection = async (
  db: Queryable,
  players: ProjectionExportState["players"],
  updatedAt: number
): Promise<void> => {
  if (players.length === 0) return;

  const visibilityMap = buildVisibilityMap(players, WORLD_WIDTH, WORLD_HEIGHT, 3);
  const rows = [...visibilityMap.entries()].map(([playerId, keys]) => [
    playerId,
    JSON.stringify(keys),
    updatedAt
  ]);

  const placeholders = rows
    .map((_, i) => `($${i * 3 + 1},$${i * 3 + 2}::jsonb,$${i * 3 + 3})`)
    .join(",");

  await db.query(
    `INSERT INTO visibility_projection_current (player_id,visible_tile_keys,updated_at)
     VALUES ${placeholders}`,
    rows.flat()
  );
};

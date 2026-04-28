import { readFile } from "node:fs/promises";

import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";
import { createSeedWorld } from "../apps/simulation/dist/apps/simulation/src/seed-state.js";

const connectionString = process.env.DATABASE_URL;
const seedProfile = process.env.SIMULATION_SEED_PROFILE ?? "season-20ai";

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const sqlFile = async (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const applySchemas = async () => {
  await pool.query(await sqlFile("apps/realtime-gateway/sql/0001_command_store.sql"));
  await pool.query(await sqlFile("apps/realtime-gateway/sql/0002_player_profiles.sql"));
  await pool.query(await sqlFile("apps/realtime-gateway/sql/0003_auth_identity_bindings.sql"));
  await pool.query(await sqlFile("apps/simulation/sql/0001_world_events.sql"));
  await pool.query(await sqlFile("apps/simulation/sql/0002_command_store.sql"));
  await pool.query(await sqlFile("apps/simulation/sql/0003_world_snapshots.sql"));
  await pool.query(await sqlFile("apps/simulation/sql/0008_bounded_storage.sql"));
};

const snapshotInitialStateFromSeed = (seedWorld) => ({
  tiles: [...seedWorld.tiles.values()]
    .map((tile) => ({
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain,
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(tile.town ? { town: tile.town } : {}),
      ...(tile.fort ? { fort: tile.fort } : {}),
      ...(tile.observatory ? { observatory: tile.observatory } : {}),
      ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
      ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
      ...(tile.sabotage ? { sabotage: tile.sabotage } : {})
    }))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y)),
  activeLocks: []
});

await applySchemas();
await pool.query(
  "TRUNCATE TABLE command_results, commands, world_events, world_snapshots, checkpoint_metadata, player_projection_current, tile_projection_current, combat_lock_projection_current, visibility_projection_current RESTART IDENTITY CASCADE"
);

const seedWorld = createSeedWorld(seedProfile);
const initialState = snapshotInitialStateFromSeed(seedWorld);
const commandEvents = [];
const createdAt = Date.now();

await pool.query(
  `
  INSERT INTO world_snapshots (
    last_applied_event_id,
    snapshot_payload,
    created_at
  )
  VALUES (
    0,
    jsonb_build_object(
      'initialState', $1::jsonb,
      'commandEvents', $2::jsonb
    ),
    $3
  )
  `,
  [JSON.stringify(initialState), JSON.stringify(commandEvents), createdAt]
);

const snapshotIdResult = await pool.query("SELECT snapshot_id FROM world_snapshots ORDER BY snapshot_id DESC LIMIT 1");
const snapshotId = Number(snapshotIdResult.rows[0]?.snapshot_id ?? 0);
if (snapshotId > 0) {
  await pool.query(
    `INSERT INTO checkpoint_metadata (
       season_id,
       current_snapshot_id,
       last_applied_event_id,
       last_compacted_event_id,
       checkpointed_at,
       updated_at
     )
     VALUES ($1, $2, 0, 0, $3, $3)
     ON CONFLICT (season_id) DO UPDATE
     SET current_snapshot_id = EXCLUDED.current_snapshot_id,
         last_applied_event_id = EXCLUDED.last_applied_event_id,
         last_compacted_event_id = EXCLUDED.last_compacted_event_id,
         checkpointed_at = EXCLUDED.checkpointed_at,
         updated_at = EXCLUDED.updated_at`,
    ["active", snapshotId, createdAt]
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      seedProfile,
      tileCount: initialState.tiles.length,
      players: seedWorld.players.size,
      snapshotId,
      createdAt
    },
    null,
    2
  )
);

await pool.end();

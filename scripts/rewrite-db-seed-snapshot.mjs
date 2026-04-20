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
  await pool.query(await sqlFile("apps/simulation/sql/0001_world_events.sql"));
  await pool.query(await sqlFile("apps/simulation/sql/0003_world_snapshots.sql"));
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
await pool.query("TRUNCATE TABLE command_results, commands, world_events, world_snapshots RESTART IDENTITY CASCADE");

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

console.log(
  JSON.stringify(
    {
      ok: true,
      seedProfile,
      tileCount: initialState.tiles.length,
      players: seedWorld.players.size,
      createdAt
    },
    null,
    2
  )
);

await pool.end();

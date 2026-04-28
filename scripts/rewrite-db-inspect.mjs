import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const connectionString = process.env.DATABASE_URL ?? process.env.SIMULATION_DATABASE_URL ?? process.env.GATEWAY_DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or SIMULATION_DATABASE_URL or GATEWAY_DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const snapshotResult = await pool.query(`
  select
    snapshot_id,
    last_applied_event_id,
    jsonb_array_length(snapshot_payload->'initialState'->'tiles') as tile_count,
    created_at
  from world_snapshots
  order by snapshot_id desc
  limit 10
`);

const commandResult = await pool.query(`select count(*)::int as count from commands`);
const eventResult = await pool.query(`select count(*)::int as count from world_events`);

console.log(
  JSON.stringify(
    {
      commands: commandResult.rows[0],
      events: eventResult.rows[0],
      snapshots: snapshotResult.rows
    },
    null,
    2
  )
);

await pool.end();

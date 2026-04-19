import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const adminUrl = process.env.DATABASE_URL ?? process.env.SIMULATION_DATABASE_URL ?? process.env.GATEWAY_DATABASE_URL;
const databaseName = process.env.DATABASE_NAME ?? "rewrite_smoke";

if (!adminUrl) {
  console.error("DATABASE_URL or SIMULATION_DATABASE_URL or GATEWAY_DATABASE_URL is required");
  process.exit(1);
}
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
  console.error("DATABASE_NAME must contain only letters, numbers, and underscores");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: adminUrl });
const existing = await pool.query("select 1 from pg_database where datname = $1", [databaseName]);
if (existing.rowCount === 0) {
  await pool.query(`create database "${databaseName}"`);
}
console.log(JSON.stringify({ ok: true, databaseName, created: existing.rowCount === 0 }));
await pool.end();

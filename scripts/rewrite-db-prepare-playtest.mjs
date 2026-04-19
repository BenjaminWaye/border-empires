import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const adminUrl = process.env.DATABASE_URL;
const databaseName = process.env.DATABASE_NAME ?? "rewrite_playtest";
const appUsers = (process.env.APP_USERS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!adminUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
  console.error("DATABASE_NAME must contain only letters, numbers, and underscores");
  process.exit(1);
}

if (appUsers.length === 0) {
  console.error("APP_USERS is required");
  process.exit(1);
}

const quoteIdentifier = (value) => `"${value.replaceAll("\"", "\"\"")}"`;

const pool = new pg.Pool({ connectionString: adminUrl });

const exists = await pool.query("select 1 from pg_database where datname = $1", [databaseName]);
if (exists.rowCount === 0) {
  await pool.query(`create database ${quoteIdentifier(databaseName)}`);
}

const dbUrl = new URL(adminUrl);
dbUrl.pathname = `/${databaseName}`;
const dbPool = new pg.Pool({ connectionString: dbUrl.toString() });

for (const appUser of appUsers) {
  await pool.query(`grant all privileges on database ${quoteIdentifier(databaseName)} to ${quoteIdentifier(appUser)}`);
  await dbPool.query(`grant usage, create on schema public to ${quoteIdentifier(appUser)}`);
  await dbPool.query(
    `alter default privileges in schema public grant all on tables to ${quoteIdentifier(appUser)}`
  );
  await dbPool.query(
    `alter default privileges in schema public grant all on sequences to ${quoteIdentifier(appUser)}`
  );
  await dbPool.query(
    `alter default privileges in schema public grant all on functions to ${quoteIdentifier(appUser)}`
  );
}

console.log(JSON.stringify({ ok: true, databaseName, appUsers }));

await dbPool.end();
await pool.end();

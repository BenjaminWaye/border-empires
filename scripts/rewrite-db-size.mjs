import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const WARN_MB = Number(process.env.REWRITE_DB_SIZE_WARN_MB ?? 300);
const CRITICAL_MB = Number(process.env.REWRITE_DB_SIZE_CRITICAL_MB ?? 400);
const EMERGENCY_MB = Number(process.env.REWRITE_DB_SIZE_EMERGENCY_MB ?? 450);

const pool = new pg.Pool({ connectionString });

try {
  const result = await pool.query<{ bytes: string }>(
    "SELECT pg_database_size(current_database())::text AS bytes"
  );
  const bytes = Number(result.rows[0]?.bytes ?? 0);
  const mb = bytes / (1024 * 1024);
  const threshold =
    mb >= EMERGENCY_MB
      ? "emergency"
      : mb >= CRITICAL_MB
        ? "critical"
        : mb >= WARN_MB
          ? "warn"
          : "ok";

  console.log(
    JSON.stringify(
      {
        ok: true,
        bytes,
        megabytes: Number(mb.toFixed(2)),
        threshold,
        limits: {
          warnMb: WARN_MB,
          criticalMb: CRITICAL_MB,
          emergencyMb: EMERGENCY_MB
        }
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}

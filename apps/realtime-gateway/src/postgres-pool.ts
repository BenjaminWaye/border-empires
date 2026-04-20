import { Pool } from "pg";

const poolsByConnectionString = new Map<string, Pool>();

export const createResilientPostgresPool = (connectionString: string, label: string): Pool => {
  const existing = poolsByConnectionString.get(connectionString);
  if (existing) return existing;
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 5_000,
    keepAlive: true,
    max: 4,
    maxUses: 5_000
  });
  pool.on("error", (error) => {
    console.error(`[${label}] postgres pool error`, error);
  });
  poolsByConnectionString.set(connectionString, pool);
  return pool;
};

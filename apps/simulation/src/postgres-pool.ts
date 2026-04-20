import { Pool } from "pg";

const poolsByConnectionString = new Map<string, Pool>();

const isSupabaseConnection = (connectionString: string): boolean => {
  if (connectionString.toLowerCase().includes("supabase.")) return true;
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  } catch {
    return false;
  }
};

const normalizedConnectionString = (connectionString: string): string => {
  if (!isSupabaseConnection(connectionString)) return connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslcert");
    url.searchParams.delete("sslkey");
    url.searchParams.delete("sslrootcert");
    return url.toString();
  } catch {
    return connectionString
      .replace(/([?&])sslmode=[^&]*/gi, "$1")
      .replace("?&", "?")
      .replace(/[?&]$/, "");
  }
};

export const createResilientPostgresPool = (connectionString: string, label: string): Pool => {
  const existing = poolsByConnectionString.get(connectionString);
  if (existing) return existing;
  const useRelaxedTls = isSupabaseConnection(connectionString);
  const pool = new Pool({
    connectionString: normalizedConnectionString(connectionString),
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 5_000,
    keepAlive: true,
    max: 4,
    maxUses: 5_000,
    ...(useRelaxedTls ? { ssl: { rejectUnauthorized: false } } : {})
  });
  pool.on("error", (error) => {
    console.error(`[${label}] postgres pool error`, error);
  });
  poolsByConnectionString.set(connectionString, pool);
  return pool;
};

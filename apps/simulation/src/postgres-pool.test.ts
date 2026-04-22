import { beforeEach, describe, expect, it, vi } from "vitest";

const errorListeners = [];
const constructedOptions = [];

vi.mock("pg", () => {
  class FakePool {
    connectionString;

    constructor(options) {
      constructedOptions.push(options);
      this.connectionString = options.connectionString;
    }

    on(event, listener) {
      if (event === "error") errorListeners.push(listener);
      return this;
    }
  }

  return { Pool: FakePool };
});

describe("createResilientPostgresPool", () => {
  beforeEach(() => {
    errorListeners.length = 0;
    constructedOptions.length = 0;
  });

  it("registers an error listener so transient pool failures do not crash the process", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createResilientPostgresPool } = await import("./postgres-pool.js");

    const pool = createResilientPostgresPool("postgres://localhost/test", "simulation-store");
    expect(pool).toBeTruthy();
    expect(errorListeners).toHaveLength(1);
    expect(constructedOptions[0]).toEqual(
      expect.objectContaining({
        connectionString: "postgres://localhost/test",
        connectionTimeoutMillis: 30_000,
        idleTimeoutMillis: 10_000,
        query_timeout: 45_000,
        keepAlive: true,
        max: 4,
        maxUses: 5_000
      })
    );

    const error = new Error("db unavailable");
    errorListeners[0](error);
    expect(consoleError).toHaveBeenCalledWith("[simulation-store] postgres pool error", error);

    consoleError.mockRestore();
  });

  it("reuses the same pool for the same connection string", async () => {
    const { createResilientPostgresPool } = await import("./postgres-pool.js");

    const first = createResilientPostgresPool("postgres://localhost/shared", "simulation-store");
    const second = createResilientPostgresPool("postgres://localhost/shared", "simulation-events");

    expect(first).toBe(second);
    expect(constructedOptions).toHaveLength(1);
    expect(errorListeners).toHaveLength(1);
  });

  it("disables TLS verification for Supabase-hosted connections", async () => {
    const { createResilientPostgresPool } = await import("./postgres-pool.js");

    createResilientPostgresPool("postgresql://postgres:pw@db.example.supabase.co:5432/postgres", "simulation-store");

    expect(constructedOptions).toHaveLength(1);
    expect(constructedOptions[0]).toEqual(
      expect.objectContaining({
        ssl: { rejectUnauthorized: false }
      })
    );
  });

  it("strips sslmode params for Supabase URLs so pg doesn't force verify-full", async () => {
    const { createResilientPostgresPool } = await import("./postgres-pool.js");

    createResilientPostgresPool(
      "postgresql://postgres:pw@db.example.supabase.co:5432/postgres?sslmode=require",
      "simulation-store"
    );

    expect(constructedOptions).toHaveLength(1);
    expect(constructedOptions[0]).toEqual(
      expect.objectContaining({
        connectionString: "postgresql://postgres:pw@db.example.supabase.co:5432/postgres"
      })
    );
  });
});

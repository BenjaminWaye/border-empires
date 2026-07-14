import { describe, expect, it, vi } from "vitest";

import { handlePersistenceConstraintViolation, isPersistenceConstraintViolation } from "./persistence-constraint-violation.js";

describe("isPersistenceConstraintViolation", () => {
  it("matches SQLite UNIQUE constraint failures case-insensitively", () => {
    expect(isPersistenceConstraintViolation(new Error("UNIQUE constraint failed: commands.player_id, commands.client_seq"))).toBe(true);
    expect(isPersistenceConstraintViolation(new Error("unique CONSTRAINT FAILED: something"))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isPersistenceConstraintViolation(new Error("database is locked"))).toBe(false);
    expect(isPersistenceConstraintViolation(new Error("ECONNRESET"))).toBe(false);
  });
});

describe("handlePersistenceConstraintViolation", () => {
  const buildDeps = () => ({
    metrics: { incrementSimPersistenceConstraintViolation: vi.fn() },
    recordLagDiagnostic: vi.fn(),
    log: { error: vi.fn() }
  });

  it("records metrics/diagnostics and returns true for a constraint violation", () => {
    const { metrics, recordLagDiagnostic, log } = buildDeps();
    const error = new Error("UNIQUE constraint failed: commands.player_id, commands.client_seq");
    const handled = handlePersistenceConstraintViolation(error, metrics, recordLagDiagnostic, log);
    expect(handled).toBe(true);
    expect(metrics.incrementSimPersistenceConstraintViolation).toHaveBeenCalledOnce();
    expect(recordLagDiagnostic).toHaveBeenCalledWith("error", "simulation_persistence_constraint_violation", { error: error.message });
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("records nothing and returns false for a non-constraint error", () => {
    const { metrics, recordLagDiagnostic, log } = buildDeps();
    const handled = handlePersistenceConstraintViolation(new Error("disk I/O error"), metrics, recordLagDiagnostic, log);
    expect(handled).toBe(false);
    expect(metrics.incrementSimPersistenceConstraintViolation).not.toHaveBeenCalled();
    expect(recordLagDiagnostic).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });
});

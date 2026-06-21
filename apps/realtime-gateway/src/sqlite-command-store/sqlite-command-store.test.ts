import { describe, expect, it, vi } from "vitest";

import { SqliteGatewayCommandStore } from "./sqlite-command-store.js";

type DatabaseSyncMock = {
  prepare: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

const fakeRow = {
  command_id: "cmd-1",
  session_id: "session-1",
  player_id: "player-1",
  client_seq: 1,
  command_type: "ATTACK" as const,
  payload_json: "{}",
  queued_at: 1300,
  status: "QUEUED" as const,
  accepted_at: null,
  rejected_at: null,
  rejected_code: null,
  rejected_message: null,
  resolved_at: null
};

const makeCommand = () => ({
  commandId: "cmd-1",
  sessionId: "session-1",
  playerId: "player-1",
  clientSeq: 1,
  issuedAt: 1234,
  type: "ATTACK" as const,
  payloadJson: "{}"
});

const makeDb = (overrides: Partial<DatabaseSyncMock> = {}) =>
  ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(() => fakeRow)
    })),
    ...overrides
  }) as unknown as DatabaseSyncMock;

describe("SqliteGatewayCommandStore", () => {
  it("retries on SQLITE_BUSY and succeeds after transient errors", async () => {
    const onRetry = vi.fn();
    let runCount = 0;

    const mockDb = makeDb({
      prepare: vi.fn(() => ({
        run: vi.fn(() => {
          runCount += 1;
          if (runCount <= 2) {
            const err = new Error("database is locked");
            (err as Record<string, unknown>).code = "SQLITE_BUSY";
            throw err;
          }
        }),
        get: vi.fn(() => fakeRow)
      }))
    });

    const store = new SqliteGatewayCommandStore(mockDb as unknown as Parameters<typeof SqliteGatewayCommandStore.prototype.constructor>[0], {
      onRetry
    });
    const result = await store.persistQueuedCommand(makeCommand(), 1300);

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(result.commandId).toBe("cmd-1");
    expect(result.status).toBe("QUEUED");
  });

  it("throws immediately on non-BUSY errors without retrying", async () => {
    const onRetry = vi.fn();

    const mockDb = makeDb({
      prepare: vi.fn(() => ({
        run: vi.fn(() => {
          const err = new Error("disk full");
          (err as Record<string, unknown>).code = "SQLITE_IOERR";
          throw err;
        }),
        get: vi.fn(() => fakeRow)
      }))
    });

    const store = new SqliteGatewayCommandStore(mockDb as unknown as Parameters<typeof SqliteGatewayCommandStore.prototype.constructor>[0], {
      onRetry
    });
    await expect(store.persistQueuedCommand(makeCommand(), 1300)).rejects.toThrow("disk full");
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries SQLITE_BUSY_TIMEOUT the same as SQLITE_BUSY", async () => {
    const onRetry = vi.fn();
    let runCount = 0;

    const mockDb = makeDb({
      prepare: vi.fn(() => ({
        run: vi.fn(() => {
          runCount += 1;
          if (runCount === 1) {
            const err = new Error("database is locked");
            (err as Record<string, unknown>).code = "SQLITE_BUSY_TIMEOUT";
            throw err;
          }
        }),
        get: vi.fn(() => fakeRow)
      }))
    });

    const store = new SqliteGatewayCommandStore(mockDb as unknown as Parameters<typeof SqliteGatewayCommandStore.prototype.constructor>[0], {
      onRetry
    });
    const result = await store.persistQueuedCommand(makeCommand(), 1300);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(result.commandId).toBe("cmd-1");
  });

  it("throws after exhausting all SQLITE_BUSY retries", async () => {
    const onRetry = vi.fn();

    const mockDb = makeDb({
      prepare: vi.fn(() => ({
        run: vi.fn(() => {
          const err = new Error("database is locked");
          (err as Record<string, unknown>).code = "SQLITE_BUSY";
          throw err;
        }),
        get: vi.fn(() => fakeRow)
      }))
    });

    const store = new SqliteGatewayCommandStore(mockDb as unknown as Parameters<typeof SqliteGatewayCommandStore.prototype.constructor>[0], {
      onRetry
    });
    await expect(store.persistQueuedCommand(makeCommand(), 1300)).rejects.toThrow("database is locked");
    // 4 total attempts = 3 retries (delays: 50, 150, 300)
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it("returns existing command on UNIQUE constraint collision (same player+seq, different commandId)", async () => {
    const mockDb = makeDb({
      prepare: vi.fn(() => ({
        run: vi.fn(() => {
          const err = new Error("UNIQUE constraint failed: commands.player_id, commands.client_seq");
          (err as Record<string, unknown>).code = "SQLITE_CONSTRAINT_UNIQUE";
          throw err;
        }),
        get: vi.fn(() => fakeRow)
      }))
    });

    const store = new SqliteGatewayCommandStore(mockDb as unknown as Parameters<typeof SqliteGatewayCommandStore.prototype.constructor>[0]);
    const command = { ...makeCommand(), commandId: "cmd-new" };
    const result = await store.persistQueuedCommand(command, 1300);
    // Returns the existing stored command, not the new commandId
    expect(result.commandId).toBe("cmd-1");
    expect(result.status).toBe("QUEUED");
  });
});


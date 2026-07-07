/**
 * Regression: the login-bootstrap event_loop_blocked incident showed
 * mainThreadTasks: [] during a real multi-second sim stall for a large
 * empire. One of the two uninstrumented synchronous costs on that path is
 * the postMessage() call here — Node structured-clones `runtimeState`
 * synchronously on the sim main thread before the worker ever sees it.
 * These tests pin that createSnapshotBuilder's optional `trackSync` hook
 * wraps exactly that call, and that omitting it is still safe.
 */

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

type WorkerMessage = { id?: number; playerId?: string; runtimeState?: unknown; options?: unknown };

class MockWorker extends EventEmitter {
  readonly posted: WorkerMessage[] = [];

  postMessage(msg: WorkerMessage): void {
    this.posted.push(msg);
    queueMicrotask(() => this.emit("message", { id: msg.id, snapshot: { tiles: [], players: [] } }));
  }

  unref(): void {}

  terminate(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("node:worker_threads", () => ({ Worker: MockWorker }));

const { createSnapshotBuilder } = await import("./snapshot-builder.js");

describe("createSnapshotBuilder trackSync wrapping", () => {
  it("wraps the worker postMessage send with the provided trackSync hook", async () => {
    const tracked: Array<{ phase: string; details: unknown }> = [];
    const pool = createSnapshotBuilder({
      workerCount: 1,
      workerScriptPath: "unused-by-mock.js",
      trackSync: (phase, details, task) => {
        tracked.push({ phase, details });
        return task();
      }
    });

    await pool.build("player-1", { tiles: [] }, {});
    await pool.close();

    expect(tracked).toHaveLength(1);
    expect(tracked[0]?.phase).toBe("snapshot_build_worker_postmessage_clone");
    expect(tracked[0]?.details).toMatchObject({ playerId: "player-1", workerSlot: 0 });
  });

  it("still builds successfully when trackSync is not provided", async () => {
    const pool = createSnapshotBuilder({
      workerCount: 1,
      workerScriptPath: "unused-by-mock.js"
    });

    const snapshot = await pool.build("player-1", { tiles: [] }, {});
    await pool.close();

    expect(snapshot).toEqual({ tiles: [], players: [] });
  });
});

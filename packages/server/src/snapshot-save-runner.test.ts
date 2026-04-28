import { describe, expect, it } from "vitest";
import { createSnapshotSaveRunner } from "./snapshot-save-runner.js";

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createSnapshotSaveRunner", () => {
  it("coalesces overlapping save requests into one trailing rerun", async () => {
    let resolveSave: (() => void) | undefined;
    let calls = 0;
    const runner = createSnapshotSaveRunner({
      save: () => {
        calls += 1;
        return new Promise<void>((resolve) => {
          resolveSave = resolve;
        });
      },
      onError: () => undefined
    });

    runner.request();
    runner.request();
    runner.request();
    await flushMicrotasks();

    expect(calls).toBe(1);

    resolveSave?.();
    await flushMicrotasks();

    expect(calls).toBe(2);
  });

  it("keeps running after a failed save", async () => {
    let rejectSave: ((reason?: unknown) => void) | undefined;
    let resolveSave: (() => void) | undefined;
    let calls = 0;
    const errors: unknown[] = [];
    const runner = createSnapshotSaveRunner({
      save: () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<void>((_resolve, reject) => {
            rejectSave = reject;
          });
        }
        return new Promise<void>((resolve) => {
          resolveSave = resolve;
        });
      },
      onError: (err) => {
        errors.push(err);
      }
    });

    runner.request();
    runner.request();
    await flushMicrotasks();

    rejectSave?.(new Error("disk slow"));
    await flushMicrotasks();

    expect(calls).toBe(2);
    expect(errors).toHaveLength(1);

    resolveSave?.();
    await flushMicrotasks();

    runner.request();
    await flushMicrotasks();

    expect(calls).toBe(3);
  });
});

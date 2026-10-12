import { Worker } from "node:worker_threads";

import { describe, expect, it } from "vitest";

import { MAIN_THREAD_STACK_CAPTURE_SOURCE } from "./main-thread-stack-capture.js";

type CaptureResult = {
  ok: boolean;
  reason?: string;
  captureMs: number;
  frames?: Array<{ functionName: string; url: string; line: number; column: number }>;
};

// Deliberately synchronous: the point is that the stack is captured while the
// main thread never yields.
function deliberatelyBlockMainThread(ms: number): number {
  const end = Date.now() + ms;
  let spins = 0;
  while (Date.now() < end) spins += 1;
  return spins;
}

const startCaptureWorker = (): Worker =>
  new Worker(
    `${MAIN_THREAD_STACK_CAPTURE_SOURCE}
const { parentPort } = require("node:worker_threads");
parentPort.on("message", (msg) => {
  setTimeout(() => captureMainThreadStack(msg.timeoutMs, 25, (result) => parentPort.postMessage(result)), msg.delayMs);
});`,
    { eval: true }
  );

describe("main-thread stack capture", () => {
  it("captures the JS stack of a main thread stuck in a synchronous loop", async () => {
    const worker = startCaptureWorker();
    try {
      const result = new Promise<CaptureResult>((resolve) => worker.once("message", resolve));
      await new Promise<void>((resolve) => worker.once("online", () => resolve()));
      worker.postMessage({ delayMs: 300, timeoutMs: 2_000 });
      deliberatelyBlockMainThread(1_500);
      const captured = await result;
      expect(captured.ok).toBe(true);
      const names = (captured.frames ?? []).map((frame) => frame.functionName);
      expect(names).toContain("deliberatelyBlockMainThread");
    } finally {
      await worker.terminate();
    }
  });
});

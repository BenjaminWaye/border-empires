import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { checkStagingRealtime, soakStagingRealtime } from "./verify-staging-realtime.mjs";

test("rejects HTTP 200 when the gateway says its simulation is disconnected", async () => {
  await assert.rejects(
    checkStagingRealtime({
      fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, simulation: { connected: false } }) }),
      WebSocketImpl: class { constructor() { throw new Error("socket should not be opened"); } }
    }),
    /simulation disconnected/
  );
});

test("requires the real WebSocket upgrade after gateway readiness", async () => {
  class FailedSocket extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit("error", new Error("upgrade refused")));
    }
    terminate() {}
  }
  await assert.rejects(
    checkStagingRealtime({
      fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, simulation: { connected: true } }) }),
      WebSocketImpl: FailedSocket
    }),
    /upgrade refused/
  );
});

test("fails when a release dies after initially passing deployment health", async () => {
  let time = 0;
  const checks = [];
  await assert.rejects(
    soakStagingRealtime({
      durationMs: 90_000,
      intervalMs: 10_000,
      now: () => time,
      sleep: async (ms) => { time += ms; },
      check: async () => {
        checks.push(time);
        if (time >= 40_000) throw new Error("gateway timed out");
      },
      log: () => undefined
    }),
    /staging realtime failed 2 consecutive checks: gateway timed out/
  );
  assert.deepEqual(checks, [0, 10_000, 20_000, 30_000, 40_000, 50_000]);
});

test("tolerates one transient failure but requires a healthy final check", async () => {
  let time = 0;
  const attempts = await soakStagingRealtime({
    durationMs: 30_000,
    intervalMs: 10_000,
    now: () => time,
    sleep: async (ms) => { time += ms; },
    check: async () => { if (time === 10_000) throw new Error("transient"); },
    log: () => undefined
  });
  assert.equal(attempts, 4);
});

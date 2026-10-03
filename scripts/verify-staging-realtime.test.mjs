import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { checkFirebaseAnonymousProvider, checkStagingGuestInit, checkStagingRealtime, soakStagingRealtime } from "./verify-staging-realtime.mjs";

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

test("the ten-minute soak catches a delayed watchdog failure", async () => {
  let time = 0;
  await assert.rejects(soakStagingRealtime({
    durationMs: 600_000,
    intervalMs: 10_000,
    now: () => time,
    sleep: async (ms) => { time += ms; },
    check: async () => { if (time >= 360_000) throw new Error("watchdog restart"); },
    log: () => undefined
  }), /watchdog restart/);
  assert.equal(time, 370_000);
});

test("guest probe signs in anonymously, reaches INIT, and deletes its Firebase account", async () => {
  const calls = [];
  class GuestSocket extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit("open"));
    }
    send(raw) {
      assert.deepEqual(JSON.parse(raw), { type: "AUTH", token: "test-id-token" });
      queueMicrotask(() => this.emit("message", JSON.stringify({ type: "INIT" })));
    }
    close() {}
    terminate() {}
  }
  await checkStagingGuestInit({
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return url.includes(":signUp")
        ? { ok: true, json: async () => ({ idToken: "test-id-token" }) }
        : { ok: true, status: 200 };
    },
    WebSocketImpl: GuestSocket
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, { returnSecureToken: true });
  assert.deepEqual(calls[1].body, { idToken: "test-id-token" });
});

test("guest probe rejects Firebase's admin-restricted-operation before opening a socket", async () => {
  await assert.rejects(checkStagingGuestInit({
    fetchImpl: async () => ({ ok: false, status: 400 }),
    WebSocketImpl: class { constructor() { throw new Error("should not open a socket"); } }
  }), /anonymous Firebase sign-in failed/);
});

test("guest probe deletes its Firebase account when AUTH fails", async () => {
  let deleted = false;
  class RejectedSocket extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit("open"));
    }
    send() { queueMicrotask(() => this.emit("message", JSON.stringify({ type: "ERROR", code: "AUTH_FAIL" }))); }
    close() {}
    terminate() {}
  }
  await assert.rejects(checkStagingGuestInit({
    fetchImpl: async (url) => {
      if (url.includes(":signUp")) return { ok: true, json: async () => ({ idToken: "test-id-token" }) };
      deleted = true;
      return { ok: true, status: 200 };
    },
    WebSocketImpl: RejectedSocket
  }), /guest AUTH rejected: AUTH_FAIL/);
  assert.equal(deleted, true);
});

test("CI reuses one anonymous probe identity instead of creating a guest on every deploy", async () => {
  const payload = Buffer.from(JSON.stringify({ firebase: { sign_in_provider: "anonymous" } })).toString("base64url");
  const idToken = `header.${payload}.signature`;
  class ProbeSocket extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit("open")); }
    send(raw) {
      assert.equal(JSON.parse(raw).token, idToken);
      queueMicrotask(() => this.emit("message", JSON.stringify({ type: "INIT" })));
    }
    close() {}
    terminate() {}
  }
  await checkStagingGuestInit({
    refreshToken: "stored-refresh-token",
    refreshAuthToken: async (token) => { assert.equal(token, "stored-refresh-token"); return idToken; },
    fetchImpl: async () => { throw new Error("probe must not create or delete a Firebase account"); },
    WebSocketImpl: ProbeSocket
  });
});

test("CI separately checks anonymous sign-up remains enabled and deletes that temporary account", async () => {
  const calls = [];
  await checkFirebaseAnonymousProvider({ fetchImpl: async (url) => {
    calls.push(url);
    return url.includes(":signUp")
      ? { ok: true, json: async () => ({ idToken: "temporary-token" }) }
      : { ok: true, status: 200 };
  } });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /:signUp/);
  assert.match(calls[1], /:delete/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { fetchActivityWithRetry } from "./daily-activity-digest.mjs";

test("fetchActivityWithRetry returns immediately on a 200", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, status: 200 };
  };
  try {
    const res = await fetchActivityWithRetry("https://example.test/api/activity");
    assert.equal(res.ok, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchActivityWithRetry retries a 503 and succeeds once the gateway recovers", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 503 };
    return { ok: true, status: 200 };
  };
  const sleeps = [];
  try {
    const res = await fetchActivityWithRetry("https://example.test/api/activity", {
      retryDelaysMs: [10, 10],
      sleep: async (ms) => sleeps.push(ms)
    });
    assert.equal(res.ok, true);
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [10, 10]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchActivityWithRetry gives up and returns the last failing response after exhausting retries", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false, status: 503 };
  };
  try {
    const res = await fetchActivityWithRetry("https://example.test/api/activity", {
      retryDelaysMs: [10, 10],
      sleep: async () => {}
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 503);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchActivityWithRetry never retries a 4xx", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false, status: 404 };
  };
  try {
    const res = await fetchActivityWithRetry("https://example.test/api/activity", {
      retryDelaysMs: [10, 10],
      sleep: async () => {
        throw new Error("should not sleep/retry on a 4xx");
      }
    });
    assert.equal(res.status, 404);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

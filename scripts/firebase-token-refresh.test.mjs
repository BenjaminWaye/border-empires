import test from "node:test";
import assert from "node:assert/strict";

import { refreshFirebaseAuthToken } from "./firebase-token-refresh.mjs";

test("refreshFirebaseAuthToken exchanges a refresh token for an id token", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let requestedBody;
  globalThis.fetch = async (url, init) => {
    requestedUrl = url;
    requestedBody = init?.body;
    return {
      ok: true,
      json: async () => ({ id_token: "fresh-id-token" })
    };
  };
  try {
    const token = await refreshFirebaseAuthToken("some-refresh-token");
    assert.equal(token, "fresh-id-token");
    assert.match(String(requestedUrl), /^https:\/\/securetoken\.googleapis\.com\/v1\/token\?key=/);
    assert.match(String(requestedBody), /grant_type=refresh_token/);
    assert.match(String(requestedBody), /refresh_token=some-refresh-token/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refreshFirebaseAuthToken throws with the status code when the exchange fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400 });
  try {
    await assert.rejects(() => refreshFirebaseAuthToken("expired-refresh-token"), /firebase token refresh failed: 400/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

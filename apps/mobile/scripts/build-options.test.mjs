import { test } from "node:test";
import assert from "node:assert/strict";
import { mobileBuildEnv } from "./build-options.mjs";

test("mobile builds default to the production rewrite gateway", () => {
  assert.equal(mobileBuildEnv().VITE_GATEWAY_WS_URL, "wss://api.borderempires.com/ws");
  assert.equal(mobileBuildEnv().VITE_BACKEND_DEFAULT, "gateway");
  assert.equal(mobileBuildEnv().VITE_NATIVE_PUBLIC_ORIGIN, "https://play.borderempires.com");
  assert.equal(mobileBuildEnv().VITE_RALLY_API_ORIGIN, "https://api.borderempires.com");
});
test("staging builds are explicit and invalid environments fail closed", () => {
  assert.equal(mobileBuildEnv("staging").VITE_GATEWAY_WS_URL, "wss://api-staging.borderempires.com/ws");
  assert.equal(mobileBuildEnv("staging").VITE_NATIVE_PUBLIC_ORIGIN, "https://staging.borderempires.com");
  assert.equal(mobileBuildEnv("staging").VITE_RALLY_API_ORIGIN, "https://api-staging.borderempires.com");
  assert.throws(() => mobileBuildEnv("prodution"), /MOBILE_ENV/);
});

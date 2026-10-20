import { test } from "node:test";
import assert from "node:assert/strict";
import { mobileBuildEnv } from "./build-options.mjs";

test("mobile builds default to the production rewrite gateway", () => {
  assert.equal(mobileBuildEnv().VITE_GATEWAY_WS_URL, "wss://api.borderempires.com/ws");
  assert.equal(mobileBuildEnv().VITE_BACKEND_DEFAULT, "gateway");
});
test("staging builds are explicit and invalid environments fail closed", () => {
  assert.equal(mobileBuildEnv("staging").VITE_GATEWAY_WS_URL, "wss://api-staging.borderempires.com/ws");
  assert.throws(() => mobileBuildEnv("prodution"), /MOBILE_ENV/);
});

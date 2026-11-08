import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Hetzner deployment treats cache-export denial as nonfatal after an image push", () => {
  const action = readFileSync(new URL("../.github/actions/hetzner-deploy/action.yml", import.meta.url), "utf8");
  assert.match(action, /push: true/);
  assert.match(action, /cache-to: type=gha,mode=max,ignore-error=true/);
  // Build/push and the health-gated deploy itself must still fail on errors.
  assert.doesNotMatch(action, /continue-on-error: true/);
});

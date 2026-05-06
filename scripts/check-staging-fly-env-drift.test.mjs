import test from "node:test";
import assert from "node:assert/strict";

import { diffExpectedEnv, parseTomlEnvSection } from "./check-staging-fly-env-drift.mjs";

test("parseTomlEnvSection reads only the env block", () => {
  const env = parseTomlEnvSection(`app = "demo"

[env]
  NODE_ENV = "staging"
  PORT = "8080"
  RETRIES = 5

[http_service]
  internal_port = 8080
`);

  assert.deepEqual(env, {
    NODE_ENV: "staging",
    PORT: "8080",
    RETRIES: "5"
  });
});

test("diffExpectedEnv reports mismatches and missing values", () => {
  const mismatches = diffExpectedEnv(
    {
      SIMULATION_ADDRESS: "border-empires-simulation-staging.flycast:50051",
      NODE_ENV: "staging",
      PORT: "8080"
    },
    {
      SIMULATION_ADDRESS: "border-empires-simulation-staging.internal:50051",
      NODE_ENV: "staging"
    }
  );

  assert.deepEqual(mismatches, [
    {
      key: "SIMULATION_ADDRESS",
      expectedValue: "border-empires-simulation-staging.flycast:50051",
      actualValue: "border-empires-simulation-staging.internal:50051"
    },
    {
      key: "PORT",
      expectedValue: "8080",
      actualValue: undefined
    }
  ]);
});

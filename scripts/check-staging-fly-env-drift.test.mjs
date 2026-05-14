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
      SIMULATION_ADDRESS: "127.0.0.1:50051",
      NODE_ENV: "staging",
      PORT: "8080"
    },
    {
      SIMULATION_ADDRESS: "stale-remote-simulation.internal:50051",
      NODE_ENV: "staging"
    }
  );

  assert.deepEqual(mismatches, [
    {
      key: "SIMULATION_ADDRESS",
      expectedValue: "127.0.0.1:50051",
      actualValue: "stale-remote-simulation.internal:50051"
    },
    {
      key: "PORT",
      expectedValue: "8080",
      actualValue: undefined
    }
  ]);
});

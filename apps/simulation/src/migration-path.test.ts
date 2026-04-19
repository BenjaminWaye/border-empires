import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveSimulationMigrationPath } from "./migration-path.js";

describe("resolveSimulationMigrationPath", () => {
  it("finds sql migrations from the source tree", async () => {
    const resolved = await resolveSimulationMigrationPath("0002_command_store.sql", import.meta.url);

    expect(resolved).toBe(path.resolve(fileURLToPath(new URL("../sql/0002_command_store.sql", import.meta.url))));
  });
});

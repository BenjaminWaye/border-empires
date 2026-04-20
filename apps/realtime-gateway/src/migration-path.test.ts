import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveGatewayMigrationPath } from "./migration-path.js";

describe("resolveGatewayMigrationPath", () => {
  it("finds sql migrations from the source tree", async () => {
    const resolved = await resolveGatewayMigrationPath("0001_command_store.sql", import.meta.url);

    expect(resolved).toBe(path.resolve(fileURLToPath(new URL("../sql/0001_command_store.sql", import.meta.url))));
  });
});

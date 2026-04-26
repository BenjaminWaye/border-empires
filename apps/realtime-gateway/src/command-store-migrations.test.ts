import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const loadSql = async (relativePath: string): Promise<string> =>
  await readFile(new URL(relativePath, import.meta.url), "utf8");

describe("command store migrations", () => {
  it("keeps gateway and simulation command-store upgrades aligned for legacy tables", async () => {
    const [gatewaySql, simulationSql] = await Promise.all([
      loadSql("../sql/0001_command_store.sql"),
      loadSql("../../simulation/sql/0002_command_store.sql")
    ]);

    for (const sql of [gatewaySql, simulationSql]) {
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS client_seq BIGINT");
      expect(sql).toContain("ALTER COLUMN command_type TYPE TEXT USING command_type::text");
      expect(sql).toContain("ROW_NUMBER() OVER (");
      expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS commands_player_seq_idx ON commands (player_id, client_seq);");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS resolved_at BIGINT");
    }
  });
});

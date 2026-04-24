import { describe, expect, it } from "vitest";

import { PostgresGatewayPlayerProfileStore } from "./postgres-player-profile-store.js";

describe("PostgresGatewayPlayerProfileStore", () => {
  it("upserts full profile on setProfile", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const store = new PostgresGatewayPlayerProfileStore(
      {
        async query(sql, params) {
          calls.push({ sql: sql.trim(), params });
          return {
            rows: [
              {
                player_id: "player-1",
                display_name: "Nauticus",
                tile_color: "#123456",
                profile_complete: true,
                updated_at: 1_000
              }
            ],
            rowCount: 1
          };
        }
      },
      () => 1_000
    );

    await expect(store.setProfile("player-1", "Nauticus", "#123456")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#123456",
      profileComplete: true,
      updatedAt: 1_000
    });
    expect(calls[0]?.sql.startsWith("INSERT INTO player_profiles")).toBe(true);
  });

  it("preserves profile_complete when updating tile color", async () => {
    const store = new PostgresGatewayPlayerProfileStore(
      {
        async query() {
          return {
            rows: [
              {
                player_id: "player-1",
                display_name: "Nauticus",
                tile_color: "#abcdef",
                profile_complete: true,
                updated_at: "3000"
              }
            ],
            rowCount: 1
          };
        }
      },
      () => 3_000
    );

    await expect(store.setTileColor("player-1", "#abcdef")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#abcdef",
      profileComplete: true,
      updatedAt: 3_000
    });
  });

  it("returns undefined when profile row does not exist", async () => {
    const store = new PostgresGatewayPlayerProfileStore({
      async query() {
        return { rows: [], rowCount: 0 };
      }
    });

    await expect(store.get("missing")).resolves.toBeUndefined();
  });
});

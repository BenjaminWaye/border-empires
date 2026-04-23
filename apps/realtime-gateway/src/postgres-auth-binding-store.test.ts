import { describe, expect, it } from "vitest";

import { PostgresGatewayAuthBindingStore } from "./postgres-auth-binding-store.js";

describe("PostgresGatewayAuthBindingStore", () => {
  it("upserts auth bindings while returning the effective player id", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const store = new PostgresGatewayAuthBindingStore(
      {
        async query(sql, params) {
          calls.push({ sql: sql.trim(), params });
          return {
            rows: [
              {
                auth_uid: "firebase-user-1",
                player_id: "player-1",
                auth_email: "nauticus@example.com",
                updated_at: 1_000
              }
            ],
            rowCount: 1
          };
        }
      },
      () => 1_000
    );

    await expect(store.bindIdentity({ uid: "firebase-user-1", playerId: "player-9", email: "nauticus@example.com" })).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus@example.com",
      updatedAt: 1_000
    });
    expect(calls[0]?.sql.startsWith("INSERT INTO auth_identity_bindings")).toBe(true);
  });

  it("returns undefined when auth uid is not bound", async () => {
    const store = new PostgresGatewayAuthBindingStore({
      async query() {
        return { rows: [], rowCount: 0 };
      }
    });

    await expect(store.getByUid("missing")).resolves.toBeUndefined();
  });
});

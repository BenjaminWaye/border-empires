import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "./auth-binding-store.js";

describe("InMemoryGatewayAuthBindingStore", () => {
  it("creates a new binding on first auth uid", async () => {
    const store = new InMemoryGatewayAuthBindingStore(() => 1_000);

    await expect(store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" })).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus@example.com",
      updatedAt: 1_000
    });
  });

  it("keeps the original player binding for the same uid", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);

    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" });
    now = 2_000;

    await expect(store.bindIdentity({ uid: "firebase-user-1", playerId: "player-9", email: "nauticus+new@example.com" })).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus+new@example.com",
      updatedAt: 2_000
    });
    await expect(store.getByUid("firebase-user-1")).resolves.toEqual({
      uid: "firebase-user-1",
      playerId: "player-1",
      email: "nauticus+new@example.com",
      updatedAt: 2_000
    });
  });

  it("finds the most recent binding by email", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);

    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" });
    now = 2_000;
    await store.bindIdentity({ uid: "firebase-user-2", playerId: "player-9", email: "NAUTICUS@example.com" });

    await expect(store.getByEmail("nauticus@example.com")).resolves.toEqual({
      uid: "firebase-user-2",
      playerId: "player-9",
      email: "NAUTICUS@example.com",
      updatedAt: 2_000
    });
  });
});

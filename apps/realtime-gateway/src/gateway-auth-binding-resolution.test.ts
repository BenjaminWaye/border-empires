import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "./auth-binding-store.js";
import { reconcileGatewayAuthBinding } from "./gateway-auth-binding-resolution.js";

describe("reconcileGatewayAuthBinding", () => {
  it("reuses the existing uid binding when present", async () => {
    const store = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await store.bindIdentity({ uid: "firebase-user-1", playerId: "player-1", email: "nauticus@example.com" });

    await expect(
      reconcileGatewayAuthBinding(
        {
          playerId: "fallback-player",
          playerName: "Nauticus",
          authUid: "firebase-user-1",
          authEmail: "nauticus@example.com"
        },
        store
      )
    ).resolves.toEqual({
      playerId: "player-1",
      playerName: "Nauticus",
      authUid: "firebase-user-1",
      authEmail: "nauticus@example.com",
      bindingSource: "uid"
    });
  });

  it("reuses the existing player binding by email when a new uid appears", async () => {
    let now = 1_000;
    const store = new InMemoryGatewayAuthBindingStore(() => now);
    await store.bindIdentity({ uid: "desktop-uid", playerId: "player-1", email: "nauticus@example.com" });

    now = 2_000;
    await expect(
      reconcileGatewayAuthBinding(
        {
          playerId: "mobile-fallback-player",
          playerName: "Nauticus",
          authUid: "mobile-uid",
          authEmail: "nauticus@example.com"
        },
        store
      )
    ).resolves.toEqual({
      playerId: "player-1",
      playerName: "Nauticus",
      authUid: "mobile-uid",
      authEmail: "nauticus@example.com",
      bindingSource: "email"
    });

    await expect(store.getByUid("mobile-uid")).resolves.toEqual({
      uid: "mobile-uid",
      playerId: "player-1",
      email: "nauticus@example.com",
      updatedAt: 2_000
    });
  });
});

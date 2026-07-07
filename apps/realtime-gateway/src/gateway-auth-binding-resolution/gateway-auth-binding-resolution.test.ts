import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
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

  it("never merges two distinct new users onto the same fallback playerId", async () => {
    // Regression test: a misconfigured GATEWAY_DEFAULT_HUMAN_PLAYER_ID previously caused
    // resolveGatewayAuthIdentity to resolve the same fallback playerId ("player-1") for
    // every unmapped Firebase user, and this reconciler then durably bound distinct uids
    // to that same shared playerId. Even if that fallback leaks through again, this
    // reconciler must never let a second, unrelated uid claim a playerId already owned
    // by someone else.
    const store = new InMemoryGatewayAuthBindingStore(() => 1_000);

    const firstUser = await reconcileGatewayAuthBinding(
      {
        playerId: "player-1",
        playerName: "Benjamin Waye",
        authUid: "firebase-uid-a",
        authEmail: "bw199005@gmail.com"
      },
      store
    );
    expect(firstUser).toEqual({
      playerId: "player-1",
      playerName: "Benjamin Waye",
      authUid: "firebase-uid-a",
      authEmail: "bw199005@gmail.com",
      bindingSource: "new"
    });

    const secondUser = await reconcileGatewayAuthBinding(
      {
        playerId: "player-1",
        playerName: "Benjamin Waye",
        authUid: "firebase-uid-b",
        authEmail: "benjamin.waye@mobileinteraction.se"
      },
      store
    );

    expect(secondUser.authUid).toBe("firebase-uid-b");
    expect(secondUser.playerId).not.toBe("player-1");
    expect(secondUser.playerId).toBe("firebase-uid-b");

    await expect(store.getByUid("firebase-uid-a")).resolves.toMatchObject({ playerId: "player-1" });
    await expect(store.getByUid("firebase-uid-b")).resolves.toMatchObject({ playerId: "firebase-uid-b" });
  });
});

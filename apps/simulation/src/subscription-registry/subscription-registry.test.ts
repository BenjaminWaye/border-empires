import { describe, expect, it } from "vitest";

import { createPlayerSubscriptionRegistry } from "./subscription-registry.js";

describe("createPlayerSubscriptionRegistry", () => {
  it("tracks subscribed players", () => {
    const registry = createPlayerSubscriptionRegistry();

    expect(registry.isSubscribed("player-1")).toBe(false);
    registry.subscribe("player-1");
    expect(registry.isSubscribed("player-1")).toBe(true);
    registry.unsubscribe("player-1");
    expect(registry.isSubscribed("player-1")).toBe(false);
  });

  it("keeps a player subscribed until every channel unsubscribes", () => {
    const registry = createPlayerSubscriptionRegistry();

    registry.subscribe("player-1");
    registry.subscribe("player-1");

    registry.unsubscribe("player-1");
    expect(registry.isSubscribed("player-1")).toBe(true);
    expect(registry.subscribedPlayerIds()).toEqual(["player-1"]);

    registry.unsubscribe("player-1");
    expect(registry.isSubscribed("player-1")).toBe(false);
  });

  it("supports keyed subscriptions without cross-canceling newer ones", () => {
    const registry = createPlayerSubscriptionRegistry();

    registry.subscribe("player-1", "1:player-1:1");
    registry.unsubscribe("player-1", "1:player-1:1");
    registry.subscribe("player-1", "1:player-1:2");
    registry.unsubscribe("player-1", "1:player-1:1");

    expect(registry.isSubscribed("player-1")).toBe(true);
    expect(registry.subscribedPlayerIds()).toEqual(["player-1"]);

    registry.unsubscribe("player-1", "1:player-1:2");
    expect(registry.isSubscribed("player-1")).toBe(false);
  });

  it("ignores late keyed subscribe after an earlier keyed unsubscribe", () => {
    const registry = createPlayerSubscriptionRegistry();

    registry.unsubscribe("player-1", "1:player-1:1");
    registry.subscribe("player-1", "1:player-1:1");

    expect(registry.isSubscribed("player-1")).toBe(false);
    expect(registry.subscribedPlayerIds()).toEqual([]);
  });

  it("forgets obsolete namespace watermarks after a newer gateway namespace arrives", () => {
    const registry = createPlayerSubscriptionRegistry();

    registry.unsubscribe("player-1", "1:player-1:3");
    registry.unsubscribe("player-1", "2:player-1:1");
    registry.subscribe("player-1", "2:player-1:2");

    expect(registry.isSubscribed("player-1")).toBe(true);
    expect(registry.subscribedPlayerIds()).toEqual(["player-1"]);

    registry.subscribe("player-1", "1:player-1:2");

    expect(registry.isSubscribed("player-1")).toBe(true);
    expect(registry.subscribedPlayerIds()).toEqual(["player-1"]);
  });
});

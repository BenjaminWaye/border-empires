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
});

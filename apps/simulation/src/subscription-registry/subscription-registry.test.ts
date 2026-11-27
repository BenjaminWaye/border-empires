import { describe, expect, it } from "vitest";

import { MAX_SPECTATORS, createPlayerSubscriptionRegistry } from "./subscription-registry.js";

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

  it("lets only a subscribed player spectate, and ends spectating with their last subscription", () => {
    const registry = createPlayerSubscriptionRegistry();

    expect(registry.setSpectator("admin", true)).toBe(false); // not subscribed
    registry.subscribe("admin", "1:admin:1");
    registry.subscribe("admin", "1:admin:2"); // a second device
    expect(registry.setSpectator("admin", true)).toBe(true);
    expect(registry.setSpectator("admin", true)).toBe(true);
    expect(registry.spectatorPlayerIds()).toEqual(["admin"]);

    registry.unsubscribe("admin", "1:admin:1");
    expect(registry.isSpectator("admin")).toBe(true); // the other device is still connected

    registry.unsubscribe("admin", "1:admin:2");
    expect(registry.isSpectator("admin")).toBe(false);
    expect(registry.spectatorPlayerIds()).toEqual([]);
  });

  it("refuses spectators past the cap instead of growing", () => {
    const registry = createPlayerSubscriptionRegistry();
    for (let index = 0; index <= MAX_SPECTATORS; index += 1) registry.subscribe(`admin-${index}`);
    for (let index = 0; index < MAX_SPECTATORS; index += 1) expect(registry.setSpectator(`admin-${index}`, true)).toBe(true);

    const oneTooMany = `admin-${MAX_SPECTATORS}`;
    expect(registry.setSpectator(oneTooMany, true)).toBe(false);
    expect(registry.isSpectator(oneTooMany)).toBe(false);
    expect(registry.spectatorPlayerIds()).toHaveLength(MAX_SPECTATORS);

    registry.setSpectator("admin-0", false);
    expect(registry.setSpectator(oneTooMany, true)).toBe(true);
  });
});

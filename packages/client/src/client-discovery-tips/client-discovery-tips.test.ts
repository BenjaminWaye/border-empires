import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCOVERY_TIPS,
  discoveryTipIdForNewlySeenTile,
  dismissActiveDiscoveryTip,
  enqueueDiscoveryTipForNewlySeenTile,
  type DiscoveryTipId
} from "./client-discovery-tips.js";

const stubWindowStorage = (): Map<string, string> => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  return storage;
};

describe("discoveryTipIdForNewlySeenTile", () => {
  it("returns TOWN for any tile with a town, regardless of resource", () => {
    expect(discoveryTipIdForNewlySeenTile({ town: { name: "X" } as never, resource: "IRON" })).toBe("TOWN");
  });

  it("maps FARM and FISH to FOOD", () => {
    expect(discoveryTipIdForNewlySeenTile({ resource: "FARM" })).toBe("FOOD");
    expect(discoveryTipIdForNewlySeenTile({ resource: "FISH" })).toBe("FOOD");
  });

  it("maps IRON to IRON, GEMS to CRYSTAL, WOOD/FUR to SUPPLY", () => {
    expect(discoveryTipIdForNewlySeenTile({ resource: "IRON" })).toBe("IRON");
    expect(discoveryTipIdForNewlySeenTile({ resource: "GEMS" })).toBe("CRYSTAL");
    expect(discoveryTipIdForNewlySeenTile({ resource: "WOOD" })).toBe("SUPPLY");
    expect(discoveryTipIdForNewlySeenTile({ resource: "FUR" })).toBe("SUPPLY");
  });

  it("returns undefined for a plain tile with no town or resource", () => {
    expect(discoveryTipIdForNewlySeenTile({})).toBeUndefined();
  });

  it("has a def for every DiscoveryTipId", () => {
    const ids: DiscoveryTipId[] = ["TOWN", "FOOD", "IRON", "CRYSTAL", "SUPPLY"];
    for (const id of ids) expect(DISCOVERY_TIPS[id].id).toBe(id);
  });
});

describe("enqueueDiscoveryTipForNewlySeenTile / dismissActiveDiscoveryTip", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubWindowStorage();
  });

  it("enqueues a tip for a newly-seen town tile", () => {
    const queue: DiscoveryTipId[] = [];
    const enqueued = enqueueDiscoveryTipForNewlySeenTile(queue, { town: { name: "X" } as never }, "a@example.com");
    expect(enqueued).toBe(true);
    expect(queue).toEqual(["TOWN"]);
  });

  it("does not enqueue twice in the same session", () => {
    const queue: DiscoveryTipId[] = [];
    enqueueDiscoveryTipForNewlySeenTile(queue, { town: { name: "X" } as never }, "a@example.com");
    const secondEnqueued = enqueueDiscoveryTipForNewlySeenTile(queue, { town: { name: "Y" } as never }, "a@example.com");
    expect(secondEnqueued).toBe(false);
    expect(queue).toEqual(["TOWN"]);
  });

  it("does not enqueue a tip already dismissed and persisted", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    dismissActiveDiscoveryTip(queue, "a@example.com");
    expect(queue).toEqual([]);

    const enqueued = enqueueDiscoveryTipForNewlySeenTile(queue, { town: { name: "Z" } as never }, "a@example.com");
    expect(enqueued).toBe(false);
    expect(queue).toEqual([]);
  });

  it("scopes dismissal per account", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    dismissActiveDiscoveryTip(queue, "a@example.com");

    const queueForB: DiscoveryTipId[] = [];
    const enqueued = enqueueDiscoveryTipForNewlySeenTile(queueForB, { town: { name: "Z" } as never }, "b@example.com");
    expect(enqueued).toBe(true);
    expect(queueForB).toEqual(["TOWN"]);
  });

  it("returns false and does not enqueue for a tile with no town/resource", () => {
    const queue: DiscoveryTipId[] = [];
    expect(enqueueDiscoveryTipForNewlySeenTile(queue, {}, "a@example.com")).toBe(false);
    expect(queue).toEqual([]);
  });

  it("re-enqueues a dismissed tip once its 30-day/season TTL has decayed", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    dismissActiveDiscoveryTip(queue, "a@example.com");

    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 24 * 60 * 60 * 1000;
    try {
      const enqueued = enqueueDiscoveryTipForNewlySeenTile(queue, { town: { name: "Z" } as never }, "a@example.com");
      expect(enqueued).toBe(true);
      expect(queue).toEqual(["TOWN"]);
    } finally {
      Date.now = realNow;
    }
  });

  it("dismissing with mute=true suppresses every future discovery tip for the account", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    dismissActiveDiscoveryTip(queue, "a@example.com", true);

    const resourceQueue: DiscoveryTipId[] = [];
    const enqueued = enqueueDiscoveryTipForNewlySeenTile(resourceQueue, { resource: "GEMS" }, "a@example.com");
    expect(enqueued).toBe(false);
    expect(resourceQueue).toEqual([]);
  });

  it("mute is scoped per account, like individual dismissals", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    dismissActiveDiscoveryTip(queue, "a@example.com", true);

    const queueForB: DiscoveryTipId[] = [];
    const enqueued = enqueueDiscoveryTipForNewlySeenTile(queueForB, { resource: "GEMS" }, "b@example.com");
    expect(enqueued).toBe(true);
    expect(queueForB).toEqual(["CRYSTAL"]);
  });
});

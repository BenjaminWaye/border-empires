import { describe, expect, it } from "vitest";

import { combatResolutionAlert, hideShardAlert, notifyInsufficientGoldForFrontierAction, pushFeed, showShardAlert } from "./client-alerts.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

describe("combatResolutionAlert", () => {
  it("uses the actual town name and focus coordinates for town captures", () => {
    const result = combatResolutionAlert(
      {
        attackType: "ATTACK",
        attackerWon: true,
        defenderOwnerId: "enemy",
        target: { x: 18, y: 42 },
        changes: [{ x: 18, y: 42, ownerId: "me", ownershipState: "SETTLED" }]
      },
      {
        targetTileBefore: {
          x: 18,
          y: 42,
          terrain: "LAND",
          ownerId: "enemy",
          ownershipState: "SETTLED",
          town: {
            name: "Aetherwick",
            type: "MARKET",
            baseGoldPerMinute: 2,
            supportCurrent: 0,
            supportMax: 0,
            goldPerMinute: 2,
            cap: 40,
            isFed: true,
            population: 18000,
            maxPopulation: 50000,
            populationTier: "TOWN",
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }
        } as Tile,
        originTileBefore: undefined
      },
      {
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy" ? "Enemy Empire" : undefined),
        prettyToken: (value: string) => value,
        resourceLabel: (value: string) => value,
        terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
        terrainAt: () => "LAND",
        tiles: new Map(),
        keyFor: (x: number, y: number) => `${x},${y}`
      }
    );

    expect(result.detail).toBe("Aetherwick was conquered from Enemy Empire.");
    expect(result.focusX).toBe(18);
    expect(result.focusY).toBe(42);
    expect(result.actionLabel).toBe("Center");
  });

  it("adds pillaged gold and strategic resources to successful attack details", () => {
    const result = combatResolutionAlert(
      {
        attackType: "ATTACK",
        attackerWon: true,
        defenderOwnerId: "enemy",
        target: { x: 18, y: 42 },
        pillagedGold: 132.5,
        pillagedStrategic: {
          FOOD: 4,
          IRON: 1.5
        }
      },
      {
        targetTileBefore: {
          x: 18,
          y: 42,
          terrain: "LAND",
          ownerId: "enemy",
          ownershipState: "SETTLED",
          town: {
            name: "Aetherwick",
            type: "MARKET",
            baseGoldPerMinute: 2,
            supportCurrent: 0,
            supportMax: 0,
            goldPerMinute: 2,
            cap: 40,
            isFed: true,
            population: 18000,
            maxPopulation: 50000,
            populationTier: "TOWN",
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }
        } as Tile,
        originTileBefore: undefined
      },
      {
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy" ? "Enemy Empire" : undefined),
        prettyToken: (value: string) => value,
        resourceLabel: (value: string) => value,
        terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
        terrainAt: () => "LAND",
        tiles: new Map(),
        keyFor: (x: number, y: number) => `${x},${y}`
      }
    );

    expect(result.detail).toBe("Aetherwick was conquered from Enemy Empire. Plundered ◉ 132.50, 🍞 4 FOOD, ⛏ 1.50 IRON.");
  });

  it("labels a captured dock tile as 'Dock' rather than the terrain name", () => {
    const result = combatResolutionAlert(
      {
        attackType: "ATTACK",
        attackerWon: true,
        defenderOwnerId: "enemy",
        target: { x: 10, y: 5 },
        changes: [{ x: 10, y: 5, ownerId: "me", ownershipState: "SETTLED" }]
      },
      {
        targetTileBefore: {
          x: 10,
          y: 5,
          terrain: "LAND",
          ownerId: "enemy",
          ownershipState: "SETTLED",
          dockId: "dock-1"
        } as Tile,
        originTileBefore: undefined
      },
      {
        playerNameForOwner: (ownerId?: string | null) => (ownerId === "enemy" ? "Enemy Empire" : undefined),
        prettyToken: (value: string) => value,
        resourceLabel: (value: string) => value,
        terrainLabel: () => "Sand",
        terrainAt: () => "LAND",
        tiles: new Map(),
        keyFor: (x: number, y: number) => `${x},${y}`
      }
    );

    expect(result.detail).toBe("Dock was conquered from Enemy Empire.");
  });
});

describe("feed attention state", () => {
  it("tracks unread noteworthy history without requiring another mobile icon", () => {
    const state = {
      feed: [],
      activePanel: null,
      mobilePanel: "core" as const,
      feedUnreadCount: 0,
      feedAttentionUntil: 0
    };

    pushFeed(state, "Research completed: Coinage.", "tech", "success");

    expect(state.feedUnreadCount).toBe(1);
    expect(state.feedAttentionUntil).toBeGreaterThan(Date.now());
  });

  it("still tracks unread history when a stale mobile feed panel is hidden on desktop", () => {
    const state = {
      feed: [],
      activePanel: null,
      mobilePanel: "feed" as const,
      feedUnreadCount: 0,
      feedAttentionUntil: 0
    };

    pushFeed(state, "Research completed: Masonry.", "tech", "success");

    expect(state.feedUnreadCount).toBe(1);
    expect(state.feedAttentionUntil).toBeGreaterThan(Date.now());
  });

  it("does not track unread history when the desktop feed panel is open", () => {
    const state = {
      feed: [],
      activePanel: "feed" as const,
      mobilePanel: "core" as const,
      feedUnreadCount: 0,
      feedAttentionUntil: 0
    };

    pushFeed(state, "Research completed: Masonry.", "tech", "success");

    expect(state.feedUnreadCount).toBe(0);
    expect(state.feedAttentionUntil).toBe(0);
  });

  it("does not write insufficient gold action feedback into the activity feed", () => {
    const state = {
      gold: 10,
      captureAlert: undefined as ClientState["captureAlert"],
      feed: [],
      activePanel: null,
      mobilePanel: "core" as const,
      feedUnreadCount: 0,
      feedAttentionUntil: 0
    };

    notifyInsufficientGoldForFrontierAction(state, "attack");

    expect(state.captureAlert?.title).toBe("Insufficient gold");
    expect(state.feed).toEqual([]);
  });
});

describe("shard rain status persistence", () => {
  it("keeps shardRainStatus set after the one-time toast alert is dismissed", () => {
    const state = {
      dismissedShardAlertKeys: new Set<string>(),
      shardAlert: undefined as ClientState["shardAlert"],
      shardRainStatus: undefined as ClientState["shardRainStatus"],
      shardRainFxUntil: 0
    };

    showShardAlert(state, { key: "started:1", phase: "started", startsAt: 1, expiresAt: 2, siteCount: 3 });
    expect(state.shardAlert).toBeDefined();
    expect(state.shardRainStatus).toBeDefined();

    hideShardAlert(state);

    expect(state.shardAlert).toBeUndefined();
    expect(state.shardRainStatus).toBeDefined();
    expect(state.shardRainStatus?.key).toBe("started:1");
  });

  it("still updates shardRainStatus for an alert key the player already dismissed", () => {
    const state = {
      dismissedShardAlertKeys: new Set<string>(["upcoming:1"]),
      shardAlert: undefined as ClientState["shardAlert"],
      shardRainStatus: undefined as ClientState["shardRainStatus"],
      shardRainFxUntil: 0
    };

    showShardAlert(state, { key: "upcoming:1", phase: "upcoming", startsAt: 1 });

    expect(state.shardAlert).toBeUndefined();
    expect(state.shardRainStatus).toBeDefined();
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { openSocket, nextNonBootstrapMessage, closeSocket, type BufferedSocket } from "./rewrite-stack-test-helpers.js";
import type { GatewayPlayerProfileStore, HintStatePatch, StoredPlayerProfile } from "../player-profile-store/player-profile-store.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";
process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "999";

const connectedStream = (_listener?: unknown, options?: { onConnect?: () => void; onDisconnect?: (error: Error | null) => void }) => {
  options?.onConnect?.();
  return () => undefined;
};

/**
 * Counts every `get` that actually reaches the store, so the test can assert
 * how many uncached reads a single login performs.
 */
class CountingProfileStore implements GatewayPlayerProfileStore {
  getCalls = 0;
  private readonly profile: StoredPlayerProfile = {
    playerId: "player-1",
    updatedAt: 1,
    dismissedHints: ["welcome", "first-expand"],
    hintsMuted: true,
    onboardingChecklistCompleted: true
  };

  async applySchema(): Promise<void> {}
  async get(): Promise<StoredPlayerProfile | undefined> {
    this.getCalls += 1;
    return { ...this.profile };
  }
  async getMany(): Promise<StoredPlayerProfile[]> {
    return [];
  }
  async listAllNamed(): Promise<StoredPlayerProfile[]> {
    return [];
  }
  async setTileColor(): Promise<StoredPlayerProfile> {
    return { ...this.profile };
  }
  async setProfile(): Promise<StoredPlayerProfile> {
    return { ...this.profile };
  }
  async setCountryFlag(): Promise<StoredPlayerProfile> {
    return { ...this.profile };
  }
  async setHintState(_playerId: string, _patch: HintStatePatch): Promise<StoredPlayerProfile> {
    return { ...this.profile };
  }
}

describe("gateway login profile read count regression", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("does not add a second uncached profile read to the login path when injecting hint state", async () => {
    // Regression guard for the 2026-09-09 staging outage. The hint/tutorial
    // state injection (#1896) called `profileStore.get(...)` directly instead
    // of the gateway's `cachedProfileGet`, adding a second uncached read to
    // the login hot path. node:sqlite is synchronous and the gateway shares
    // its database file with the simulation worker, so an uncached read there
    // blocks the gateway event loop for up to PRAGMA busy_timeout (5s)
    // whenever the sim holds a write lock. Stacked with the login path's other
    // reads that pushed a real login past the 30s event-loop watchdog, which
    // SIGKILLed the machine into a crash loop.
    //
    // The profile for this player is already fetched (and cached) by the auth
    // step earlier in the same login, so the hint-state injection must be a
    // cache hit: exactly one read should reach the store for one login.
    const profileStore = new CountingProfileStore();
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      profileStore,
      simulationClient: {
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId) => ({
          playerId,
          tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }]
        }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const buffered: BufferedSocket = await openSocket(started.wsUrl);
    const initMessage = nextNonBootstrapMessage(buffered, "init after auth");
    buffered.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await initMessage;

    expect(init.type).toBe("INIT");
    // The hint state still round-trips into the INIT payload. These must be
    // non-default values: asserting the `?? []` / `?? false` fallbacks would
    // also pass if the cached profile carried no hint state at all.
    const player = init.player as Record<string, unknown>;
    expect(player.dismissedHints).toEqual(["welcome", "first-expand"]);
    expect(player.hintsMuted).toBe(true);
    expect(player.onboardingChecklistCompleted).toBe(true);
    // ...but without a second trip to the store. Before the fix this was 2.
    expect(profileStore.getCalls).toBe(1);

    await closeSocket(buffered.socket);
  });
});

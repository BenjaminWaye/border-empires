import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

import { handleSetHintStateMessage, hintStateInitFields, type StoredHintState } from "../gateway-app/handle-set-hint-state-message.js";
import { SqliteGatewayPlayerProfileStore } from "../sqlite-player-profile-store.js";
import { mergeMetPlayers } from "./met-players-profile.js";
import { InMemoryGatewayPlayerProfileStore, type GatewayPlayerProfileStore } from "./player-profile-store.js";

// Playtest run 5: "Empires you've met · 0" in a fresh browser, and rivals fought or truced the day
// before dropped off the list, because the set lived only in the browser. It is now on the profile.

type DatabaseSyncCtor = new (path: string) => { exec(sql: string): void; close(): void };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

const sqliteStore = async (): Promise<GatewayPlayerProfileStore> => {
  const store = new SqliteGatewayPlayerProfileStore(new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteGatewayPlayerProfileStore>[0], () => 1_000);
  await store.applySchema();
  return store;
};

describe("mergeMetPlayers", () => {
  it("unions a season's sets, replaces another season's and clears on an empty list", () => {
    expect(mergeMetPlayers(undefined, {})).toBeUndefined();
    expect(mergeMetPlayers({ metPlayerIds: ["a"], metPlayersSeasonId: "s1" }, { metPlayerIds: ["b"], metPlayersSeasonId: "s1" })).toEqual({ metPlayerIds: ["a", "b"], metPlayersSeasonId: "s1" });
    expect(mergeMetPlayers({ metPlayerIds: ["a"], metPlayersSeasonId: "s1" }, { metPlayerIds: ["b"], metPlayersSeasonId: "s2" })).toEqual({ metPlayerIds: ["b"], metPlayersSeasonId: "s2" });
    expect(mergeMetPlayers({ metPlayerIds: ["a"], metPlayersSeasonId: "s1" }, { metPlayerIds: [], metPlayersSeasonId: "s1" })).toEqual({ metPlayerIds: [], metPlayersSeasonId: "s1" });
  });
});

describe.each([
  ["in-memory", async (): Promise<GatewayPlayerProfileStore> => new InMemoryGatewayPlayerProfileStore()],
  ["sqlite", sqliteStore]
])("met empires on the %s profile store", (_label, createStore) => {
  it("keeps the union across devices and survives other profile writes", async () => {
    const store = await createStore();
    await store.setHintState("p1", { metPlayerIds: ["ai-henrik", "ai-ashhaven"], metPlayersSeasonId: "s1" });
    // A fresh browser that has only seen one empire so far doesn't shrink the set.
    await store.setHintState("p1", { metPlayerIds: ["ai-rowan"], metPlayersSeasonId: "s1" });
    await store.setHintState("p1", { hintsMuted: true });
    await store.setEmailNotificationPrefs("p1", { truceOffer: false });
    await store.setTileColor("p1", "#123456");
    const profile = await store.get("p1");
    expect(profile?.metPlayerIds).toEqual(["ai-henrik", "ai-ashhaven", "ai-rowan"]);
    expect(hintStateInitFields(profile)).toEqual(expect.objectContaining({ metPlayerIds: ["ai-henrik", "ai-ashhaven", "ai-rowan"], metPlayersSeasonId: "s1" }));
  });
});

describe("SET_HINT_STATE met empires", () => {
  const run = async (metPlayerIds: unknown, metPlayersSeasonId: unknown) => {
    const setHintState = vi.fn(async (_playerId: string, patch: StoredHintState) => patch);
    await handleSetHintStateMessage({
      playerId: "p1",
      dismissedHints: undefined,
      hintsMuted: undefined,
      onboardingChecklistCompleted: undefined,
      musterUnlockedSeasonId: undefined,
      metPlayerIds,
      metPlayersSeasonId,
      profileStore: { setHintState },
      invalidateProfileCache: vi.fn(),
      sendJson: vi.fn()
    });
    return setHintState;
  };

  it("saves the set with its season", async () => {
    expect(await run(["ai-1"], "s1")).toHaveBeenCalledWith("p1", { metPlayerIds: ["ai-1"], metPlayersSeasonId: "s1" });
  });

  it("ignores a set without a season, a malformed set or an oversized one", async () => {
    expect(await run(["ai-1"], undefined)).toHaveBeenCalledWith("p1", {});
    expect(await run(["ai-1", 7], "s1")).toHaveBeenCalledWith("p1", {});
    expect(await run(Array.from({ length: 501 }, (_, i) => `p${i}`), "s1")).toHaveBeenCalledWith("p1", {});
  });
});

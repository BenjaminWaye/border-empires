import { describe, expect, it, vi } from "vitest";
import { MUSTER_FLAG_CAP_UPGRADE_COST } from "@border-empires/shared";
import { buildMusterActions } from "./client-muster-tile-actions.js";
import type { Tile } from "./client-types.js";

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

const ownTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 3,
  y: 3,
  terrain: "LAND",
  ownerId: "me",
  ...overrides
});

describe("buildMusterActions", () => {
  it("returns nothing for a tile the player doesn't own", () => {
    stubWindowStorage();
    expect(buildMusterActions(ownTile({ ownerId: "rival" }), { me: "me", authEmail: "", manpower: 0 })).toEqual([]);
  });

  it("hides the muster option on an un-mustered tile before the player has met a rival empire", () => {
    stubWindowStorage();
    expect(buildMusterActions(ownTile(), { me: "me", authEmail: "a@example.com", manpower: 0 })).toEqual([]);
  });

  it("offers Stage Muster once mustering has been unlocked", async () => {
    stubWindowStorage();
    const { markMusterUnlocked } = await import("./client-muster-unlock/client-muster-unlock-storage.js");
    markMusterUnlocked("a@example.com");
    const actions = buildMusterActions(ownTile(), { me: "me", authEmail: "a@example.com", manpower: 0 });
    expect(actions.map((a) => a.id)).toEqual(["muster_hold"]);
  });

  it("still shows Clear Muster for an existing flag even if never explicitly unlocked", () => {
    stubWindowStorage();
    const actions = buildMusterActions(
      ownTile({ muster: { ownerId: "me", amount: 40, mode: "HOLD", updatedAt: 0 } }),
      { me: "me", authEmail: "a@example.com", manpower: MUSTER_FLAG_CAP_UPGRADE_COST }
    );
    expect(actions.map((a) => a.id)).toEqual(["muster_advance", "muster_march", "muster_expand_cap", "muster_clear"]);
  });

  it("offers Set Hold and March To for an ADVANCE flag", () => {
    stubWindowStorage();
    const actions = buildMusterActions(
      ownTile({ muster: { ownerId: "me", amount: 40, mode: "ADVANCE", updatedAt: 0 } }),
      { me: "me", authEmail: "a@example.com", manpower: MUSTER_FLAG_CAP_UPGRADE_COST }
    );
    expect(actions.map((a) => a.id)).toEqual(["muster_hold", "muster_march", "muster_expand_cap", "muster_clear"]);
  });

  it("offers Cancel March instead of the mode toggle for a MARCH flag", () => {
    stubWindowStorage();
    const actions = buildMusterActions(
      ownTile({ muster: { ownerId: "me", amount: 40, mode: "MARCH", targetX: 5, targetY: 5, updatedAt: 0 } }),
      { me: "me", authEmail: "a@example.com", manpower: MUSTER_FLAG_CAP_UPGRADE_COST }
    );
    expect(actions.map((a) => a.id)).toEqual(["muster_march_cancel", "muster_expand_cap", "muster_clear"]);
  });

  it("disables Expand Capacity when the player can't afford it", () => {
    stubWindowStorage();
    const actions = buildMusterActions(
      ownTile({ muster: { ownerId: "me", amount: 40, mode: "HOLD", updatedAt: 0 } }),
      { me: "me", authEmail: "a@example.com", manpower: MUSTER_FLAG_CAP_UPGRADE_COST - 1 }
    );
    const expand = actions.find((a) => a.id === "muster_expand_cap");
    expect(expand?.disabled).toBe(true);
    expect(expand?.disabledReason).toContain(String(MUSTER_FLAG_CAP_UPGRADE_COST));
  });
});

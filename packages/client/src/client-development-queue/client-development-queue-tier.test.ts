import { describe, expect, it, vi } from "vitest";
import type { ChosenStructureTier } from "@border-empires/shared";
import {
  isQueuedDevelopmentActionStillValid,
  mergeServerDevQueueIntoRestoredQueue,
  persistDevelopmentQueueForPlayer,
  restorePersistedDevelopmentQueueForPlayer
} from "./client-development-queue.js";

// The Fortify / Siege picker's chosen tier on queued builds (structure-tier-choice.ts).

const installSessionStorageMock = () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear()
  });
};

const fortBuild = (structureType: "FORT" | "SIEGE_BATTERY", tier?: ChosenStructureTier) => ({
  kind: "BUILD" as const, x: 2, y: 2, tileKey: "2,2", label: "Build",
  payload: { type: "BUILD_STRUCTURE" as const, x: 2, y: 2, structureType, ...(tier ? { tier } : {}) },
  optimisticKind: structureType
});

describe("queued build tier", () => {
  // Regression: the sessionStorage restore rebuilt the payload without `tier`,
  // and the restored copy wins over the server's -- so a reload silently
  // turned a chosen plain Fort back into the best tier (more manpower and slots).
  it("survives a reload from sessionStorage", () => {
    installSessionStorageMock();
    persistDevelopmentQueueForPlayer("me", [fortBuild("FORT", "FORT")]);
    const [restored] = restorePersistedDevelopmentQueueForPlayer("me", new Map());
    expect(restored).toMatchObject({ payload: { structureType: "FORT", tier: "FORT" } });
  });

  it("drops a corrupt tier on restore instead of sending it", () => {
    installSessionStorageMock();
    persistDevelopmentQueueForPlayer("me", [fortBuild("FORT", "MEGA_FORT" as ChosenStructureTier)]);
    const [restored] = restorePersistedDevelopmentQueueForPlayer("me", new Map());
    expect(restored?.kind === "BUILD" && restored.payload.type === "BUILD_STRUCTURE" && restored.payload).not.toHaveProperty("tier");
  });

  it("labels a reconstructed server entry with the chosen tier", () => {
    const [rebuilt] = mergeServerDevQueueIntoRestoredQueue([], [{ tileKey: "2,2", x: 2, y: 2, kind: "BUILD", structureType: "FORT", tier: "THUNDER_BASTION", queuedAt: 1 }]);
    expect(rebuilt?.label).toBe("Build Thunder Bastion at (2, 2)");
  });

  // Regression: any standing fort made a queued fort build look "already done",
  // so a tier-skipping upgrade (Palisade -> Thunder Bastion) was pruned on reconnect.
  it("keeps a queued upgrade until the standing tier reaches the chosen one", () => {
    const tile = (fort: { status: string; variant: "PALISADE" | "FORT" | "THUNDER_BASTION" }) =>
      new Map([["2,2", { ownerId: "me", ownershipState: "SETTLED" as const, fort }]]);
    expect(isQueuedDevelopmentActionStillValid(fortBuild("FORT", "THUNDER_BASTION"), tile({ status: "active", variant: "PALISADE" }), "me")).toBe(true);
    expect(isQueuedDevelopmentActionStillValid(fortBuild("FORT", "THUNDER_BASTION"), tile({ status: "active", variant: "FORT" }), "me")).toBe(true);
    expect(isQueuedDevelopmentActionStillValid(fortBuild("FORT", "THUNDER_BASTION"), tile({ status: "active", variant: "THUNDER_BASTION" }), "me")).toBe(false);
    // A default (tierless) fort build is done once any fort stands, as before.
    expect(isQueuedDevelopmentActionStillValid(fortBuild("FORT"), tile({ status: "active", variant: "PALISADE" }), "me")).toBe(false);
  });

  it("applies the same rule to siege tiers", () => {
    const tiles = new Map([["2,2", { ownerId: "me", ownershipState: "SETTLED" as const, siegeBattery: { status: "active", variant: "SIEGE_BATTERY" as const } }]]);
    expect(isQueuedDevelopmentActionStillValid(fortBuild("SIEGE_BATTERY", "DREAD_TOWER"), tiles, "me")).toBe(true);
    expect(isQueuedDevelopmentActionStillValid(fortBuild("SIEGE_BATTERY", "SIEGE_BATTERY"), tiles, "me")).toBe(false);
  });
});

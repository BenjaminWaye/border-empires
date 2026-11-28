import { describe, expect, it, vi } from "vitest";

import { defaultHouseCrestFor, SEASONAL_AI_NAMES } from "@border-empires/shared";

import { buildTakenNameSet, createSerialLock, displayNameKey, isReservedDisplayName } from "../display-name-uniqueness/display-name-uniqueness.js";
import { buildTakenColorSet } from "../player-color-allocation/build-taken-color-set.js";
import { createPlayerProfileOverrides } from "../player-profile-overrides.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { provisionGuestProfile, suggestGuestName } from "./guest-profile.js";

const HOUSE_NAME = /^House [A-Z][a-z]+( [IVX]+)?$/;

const build = () => {
  const profileStore = new InMemoryGatewayPlayerProfileStore();
  const profileOverrides = createPlayerProfileOverrides();
  const broadcastStyle = vi.fn();
  const onProvisioned = vi.fn();
  const invalidateProfileCache = vi.fn();
  const assignDefaultCrest = vi.fn(async () => true);
  const runExclusive = createSerialLock();
  const deps = {
    profileStore,
    profileOverrides,
    buildTakenNameSet: (id: string) => buildTakenNameSet(id, { profileStore, profileOverrides }),
    buildTakenColorSet: (id: string) => buildTakenColorSet(id, { profileStore, profileOverrides }),
    runExclusive,
    invalidateProfileCache,
    broadcastStyle,
    assignDefaultCrest,
    onProvisioned
  };
  return { deps, profileStore, profileOverrides, broadcastStyle, onProvisioned, invalidateProfileCache, assignDefaultCrest };
};

// First-15 round 1 (2026-11-28): "House Noname 47" read as a placeholder; guests now get a House name.
describe("suggestGuestName", () => {
  it("gives a House name, never one held, reserved or an AI's", () => {
    const name = suggestGuestName(new Set());
    expect(name).toMatch(HOUSE_NAME);
    expect(name).not.toMatch(/noname/i);
    expect(isReservedDisplayName(name)).toBe(false);
    expect(SEASONAL_AI_NAMES as readonly string[]).not.toContain(name);
    const fixed = () => 0;
    const first = suggestGuestName(new Set(), fixed);
    expect(suggestGuestName(new Set([displayNameKey(first)]), fixed)).not.toBe(first);
  });
});

describe("provisionGuestProfile", () => {
  it("stores a House name, a colour and a crest, marks the profile incomplete, and tells everyone the new style", async () => {
    const { deps, profileStore, profileOverrides, broadcastStyle, onProvisioned, invalidateProfileCache, assignDefaultCrest } = build();

    const stored = await provisionGuestProfile(deps, "guest-a");
    const name = stored?.name ?? "";

    expect(name).toMatch(HOUSE_NAME);
    expect(stored).toMatchObject({ profileComplete: false });
    expect(stored?.tileColor).toMatch(/^#[0-9a-f]{6}$/);
    await expect(profileStore.get("guest-a")).resolves.toMatchObject({ name, profileComplete: false });
    expect(profileOverrides.get("guest-a")).toMatchObject({ name, tileColor: stored?.tileColor, profileComplete: false });
    expect(broadcastStyle).toHaveBeenCalledWith("guest-a", name, stored?.tileColor);
    expect(assignDefaultCrest).toHaveBeenCalledWith("guest-a", defaultHouseCrestFor("guest-a"));
    expect(invalidateProfileCache).toHaveBeenCalledWith("guest-a");
    expect(onProvisioned).toHaveBeenCalledTimes(1);
  });

  it("gives each guest their own name and their own colour, even when they arrive at once", async () => {
    const { deps } = build();
    const sameEveryTime = { ...deps, random: () => 0 };

    const results = await Promise.all(["g1", "g2", "g3"].map((id) => provisionGuestProfile(sameEveryTime, id)));

    expect(new Set(results.map((profile) => profile?.name)).size).toBe(3);
    expect(new Set(results.map((profile) => profile?.tileColor)).size).toBe(3);
  });

  it("leaves a returning guest alone: no new name, no second broadcast", async () => {
    const { deps, broadcastStyle, onProvisioned } = build();
    await provisionGuestProfile(deps, "guest-a");

    await expect(provisionGuestProfile(deps, "guest-a")).resolves.toBeUndefined();

    expect(broadcastStyle).toHaveBeenCalledTimes(1);
    expect(onProvisioned).toHaveBeenCalledTimes(1);
  });

  it("never overwrites a player who already has a real name", async () => {
    const { deps, profileStore } = build();
    await profileStore.setProfile("real", "Ada Lovelace", "#123456", undefined, undefined);

    await expect(provisionGuestProfile(deps, "real")).resolves.toBeUndefined();

    await expect(profileStore.get("real")).resolves.toMatchObject({ name: "Ada Lovelace", profileComplete: true });
  });
});

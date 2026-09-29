import { describe, expect, it, vi } from "vitest";

import { buildTakenNameSet, createSerialLock, displayNameKey } from "../display-name-uniqueness/display-name-uniqueness.js";
import { buildTakenColorSet } from "../player-color-allocation/build-taken-color-set.js";
import { createPlayerProfileOverrides } from "../player-profile-overrides.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { guestDisplayName, provisionGuestProfile, suggestGuestName } from "./guest-profile.js";

const build = () => {
  const profileStore = new InMemoryGatewayPlayerProfileStore();
  const profileOverrides = createPlayerProfileOverrides();
  const broadcastStyle = vi.fn();
  const onProvisioned = vi.fn();
  const invalidateProfileCache = vi.fn();
  const runExclusive = createSerialLock();
  const deps = {
    profileStore,
    profileOverrides,
    buildTakenNameSet: (id: string) => buildTakenNameSet(id, { profileStore, profileOverrides }),
    buildTakenColorSet: (id: string) => buildTakenColorSet(id, { profileStore, profileOverrides }),
    runExclusive,
    invalidateProfileCache,
    broadcastStyle,
    onProvisioned
  };
  return { deps, profileStore, profileOverrides, broadcastStyle, onProvisioned, invalidateProfileCache };
};

describe("suggestGuestName", () => {
  it("uses the lowest number not in use, so freed numbers are reused", () => {
    expect(suggestGuestName(new Set())).toBe("House Noname 1");
    expect(suggestGuestName(new Set([displayNameKey(guestDisplayName(1)), displayNameKey(guestDisplayName(2))]))).toBe("House Noname 3");
    expect(suggestGuestName(new Set([displayNameKey(guestDisplayName(2))]))).toBe("House Noname 1");
  });
});

describe("provisionGuestProfile", () => {
  it("stores a numbered name and a colour, marks the profile incomplete, and tells everyone the new style", async () => {
    const { deps, profileStore, profileOverrides, broadcastStyle, onProvisioned, invalidateProfileCache } = build();

    const stored = await provisionGuestProfile(deps, "guest-a");

    expect(stored).toMatchObject({ name: "House Noname 1", profileComplete: false });
    expect(stored?.tileColor).toMatch(/^#[0-9a-f]{6}$/);
    await expect(profileStore.get("guest-a")).resolves.toMatchObject({ name: "House Noname 1", profileComplete: false });
    expect(profileOverrides.get("guest-a")).toMatchObject({ name: "House Noname 1", tileColor: stored?.tileColor, profileComplete: false });
    expect(broadcastStyle).toHaveBeenCalledWith("guest-a", "House Noname 1", stored?.tileColor);
    expect(invalidateProfileCache).toHaveBeenCalledWith("guest-a");
    expect(onProvisioned).toHaveBeenCalledTimes(1);
  });

  it("gives each guest their own number and their own colour, even when they arrive at once", async () => {
    const { deps } = build();

    const results = await Promise.all(["g1", "g2", "g3"].map((id) => provisionGuestProfile(deps, id)));

    expect(results.map((profile) => profile?.name).sort()).toEqual(["House Noname 1", "House Noname 2", "House Noname 3"]);
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

  it("reuses a number once its guest has renamed themselves", async () => {
    const { deps, profileStore, profileOverrides } = build();
    await provisionGuestProfile(deps, "g1");
    await provisionGuestProfile(deps, "g2");
    await profileStore.setProfile("g1", "House Ashgrove", "#111111", undefined, undefined);
    profileOverrides.upsert("g1", { name: "House Ashgrove" });

    const third = await provisionGuestProfile(deps, "g3");

    expect(third?.name).toBe("House Noname 1");
  });
});

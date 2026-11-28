import { describe, expect, it } from "vitest";

import { createAccountCosmeticsService } from "../account-cosmetics/account-cosmetics-service.js";
import { InMemoryAccountCosmeticsStore } from "../account-cosmetics/account-cosmetics-store.js";
import { handleSetProfileMessage, type SetProfileMessageDeps } from "../gateway-app/handle-set-profile-message.js";
import { handleSetTileColorMessage } from "../gateway-app/handle-set-tile-color-message.js";
import { TakenColorSet } from "../player-color-allocation/taken-color-set.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { PROFILE_CHANGE_LIMIT_REASON, profileChangeAllowanceFields } from "./profile-change-allowance.js";

// Owner rule 2026-11-27: name, colour and crest can each be changed once per
// Sector Contest, each with its own allowance. Playtest: players feared that
// saving only a crest or colour would spend their name change.

const ME = "me";

const setup = async () => {
  const profiles = new InMemoryGatewayPlayerProfileStore();
  await profiles.setProfile(ME, "House Ash", "#112233");
  let season = "s1";
  const sent: unknown[] = [];
  const updates: unknown[] = [];
  const profileMessage = (displayName: string, color: string): SetProfileMessageDeps => ({
    playerId: ME,
    displayName,
    color,
    canToggleFog: false,
    buildTakenColorSet: async () => new TakenColorSet(),
    incrementColorCollisionRejectedTotal: () => {},
    buildTakenNameSet: async () => new Set(),
    incrementDisplayNameCollisionRejectedTotal: () => {},
    runExclusive: (task) => task(),
    profileStore: profiles,
    invalidateProfileCache: () => {},
    profileOverrides: { upsert: (_id, patch) => patch },
    getCurrentSeasonId: async () => season,
    renamePlayer: () => {},
    sendJson: (payload) => sent.push(payload),
    allSockets: () => [],
    socketsForPlayer: () => ["socket"],
    queueOrSendSessionPayload: (_socket, payload) => updates.push(payload),
    preSerializeBroadcast: (payload) => payload
  });
  const cosmetics = new InMemoryAccountCosmeticsStore();
  let tick = 0;
  const service = createAccountCosmeticsService({
    store: cosmetics,
    broadcastToAll: () => {},
    sendToPlayer: () => {},
    now: () => (tick += 10_000),
    getCurrentSeasonId: async () => season
  });
  const setCrest = async (cosmeticId: string | null) => {
    const replies: unknown[] = [];
    await service.handleClientMessage(ME, { type: "SET_COSMETIC", slot: "crest", cosmeticId }, (payload) => replies.push(payload));
    return replies[0] as Record<string, unknown>;
  };
  const allowance = async () => profileChangeAllowanceFields(await profiles.get(ME), season);
  return { profiles, sent, updates, profileMessage, setCrest, allowance, nextSeason: () => { season = "s2"; } };
};

describe("once-per-contest name, colour and crest changes", () => {
  it("a name change spends only the name allowance, and a second one is refused", async () => {
    const t = await setup();
    await handleSetProfileMessage(t.profileMessage("House Birch", "#112233"));
    expect(await t.allowance()).toEqual({ nameChangeUsed: true, colorChangeUsed: false });
    expect(t.updates).toContainEqual(expect.objectContaining({ type: "PLAYER_UPDATE", nameChangeUsed: true, colorChangeUsed: false }));
    await handleSetProfileMessage(t.profileMessage("House Cedar", "#112233"));
    expect(t.sent).toContainEqual({ type: "ERROR", code: "DISPLAY_NAME_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.name });
    expect((await t.profiles.get(ME))?.name).toBe("House Birch");
    // The colour is still free to change once.
    await handleSetProfileMessage(t.profileMessage("House Birch", "#445566"));
    expect((await t.profiles.get(ME))?.tileColor).toBe("#445566");
  });

  it("a colour change spends only the colour allowance, on either message", async () => {
    const t = await setup();
    await handleSetProfileMessage(t.profileMessage("House Ash", "#445566"));
    expect(await t.allowance()).toEqual({ nameChangeUsed: false, colorChangeUsed: true });
    await handleSetProfileMessage(t.profileMessage("House Ash", "#778899"));
    expect(t.sent).toContainEqual({ type: "ERROR", code: "COLOR_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.color });
    // SET_TILE_COLOR used to skip the limit.
    const base = t.profileMessage("House Ash", "#778899");
    await handleSetTileColorMessage({ ...base, profileStore: t.profiles });
    expect(t.sent.filter((m) => (m as { code?: string }).code === "COLOR_LIMIT")).toHaveLength(2);
    expect((await t.profiles.get(ME))?.tileColor).toBe("#445566");
    expect((await t.allowance()).nameChangeUsed).toBe(false);
  });

  it("SET_TILE_COLOR spends the colour allowance too", async () => {
    const t = await setup();
    await handleSetTileColorMessage({ ...t.profileMessage("House Ash", "#445566"), profileStore: t.profiles });
    expect(await t.allowance()).toEqual({ nameChangeUsed: false, colorChangeUsed: true });
    await handleSetProfileMessage(t.profileMessage("House Ash", "#778899"));
    expect(t.sent).toContainEqual({ type: "ERROR", code: "COLOR_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.color });
  });

  it("a crest change spends only the crest allowance: the first pick from the letter counts", async () => {
    const t = await setup();
    const first = await t.setCrest("crest-anchor");
    expect(first).toEqual(expect.objectContaining({ type: "COSMETICS_STATE", crestChangeUsed: true }));
    expect(await t.allowance()).toEqual({ nameChangeUsed: false, colorChangeUsed: false });
    expect(await t.setCrest(null)).toEqual({ type: "ERROR", code: "COSMETIC_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.crest, slot: "crest" });
    // Name and colour are untouched by the crest.
    await handleSetProfileMessage(t.profileMessage("House Birch", "#445566"));
    expect(await t.allowance()).toEqual({ nameChangeUsed: true, colorChangeUsed: true });
  });

  it("every allowance comes back in the next contest", async () => {
    const t = await setup();
    await t.setCrest("crest-anchor");
    await handleSetProfileMessage(t.profileMessage("House Birch", "#445566"));
    t.nextSeason();
    expect(await t.allowance()).toEqual({ nameChangeUsed: false, colorChangeUsed: false });
    expect(await t.setCrest(null)).toEqual(expect.objectContaining({ type: "COSMETICS_STATE", crestChangeUsed: true }));
  });

  it("the first profile setup spends nothing", async () => {
    const t = await setup();
    await t.profiles.setProfile(ME, "Guest 12", "#112233", undefined, undefined, { profileComplete: false });
    await handleSetProfileMessage(t.profileMessage("House Birch", "#445566"));
    expect(await t.allowance()).toEqual({ nameChangeUsed: false, colorChangeUsed: false });
  });
});

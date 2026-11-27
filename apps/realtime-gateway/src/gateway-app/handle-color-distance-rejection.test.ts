import { describe, expect, test, vi } from "vitest";
import { TakenColorSet } from "../player-color-allocation/taken-color-set.js";
import { handleSetProfileMessage, type SetProfileMessageDeps } from "./handle-set-profile-message.js";
import { handleSetTileColorMessage, type SetTileColorMessageDeps } from "./handle-set-tile-color-message.js";

// Owner rule 2026-11-27: a playtester read a rival's pale pink (#fabebe) inside
// their island as their own similar pink. Picks too close to an active
// empire's colour are refused wherever a colour is set.
const rosaTaken = (): TakenColorSet =>
  new TakenColorSet(["#fabebe"], [{ playerId: "rosa", name: "Rosa", color: "#fabebe" }]);

const profileDeps = (sent: unknown[], existing: { name?: string; tileColor?: string; profileComplete?: boolean } | undefined) => {
  const setProfile = vi.fn(async (_id: string, name: string, tileColor: string) => ({ name, tileColor, profileComplete: true }));
  const deps: SetProfileMessageDeps = {
    playerId: "me",
    displayName: "Me",
    color: "#f7b6d2",
    canToggleFog: false,
    buildTakenColorSet: async () => rosaTaken(),
    incrementColorCollisionRejectedTotal: () => {},
    buildTakenNameSet: async () => new Set(),
    incrementDisplayNameCollisionRejectedTotal: () => {},
    runExclusive: (task) => task(),
    profileStore: { get: async () => existing, setProfile },
    invalidateProfileCache: () => {},
    profileOverrides: { upsert: (_id, patch) => patch },
    getCurrentSeasonId: async () => "s1",
    renamePlayer: () => {},
    sendJson: (payload) => sent.push(payload),
    allSockets: () => [],
    socketsForPlayer: () => [],
    queueOrSendSessionPayload: () => {},
    preSerializeBroadcast: (payload) => payload
  };
  return { deps, setProfile };
};

describe("SET_PROFILE colour distance", () => {
  test("'Found your first standard' refuses a colour too close to a rival", async () => {
    const sent: unknown[] = [];
    const { deps, setProfile } = profileDeps(sent, undefined);
    await handleSetProfileMessage(deps);
    expect(setProfile).not.toHaveBeenCalled();
    expect(sent).toEqual([expect.objectContaining({ type: "ERROR", code: "COLOR_TAKEN", message: "Too close to Rosa's colour." })]);
  });

  test("a rename keeps a colour the player already holds, even one that now clashes", async () => {
    const sent: unknown[] = [];
    const { deps, setProfile } = profileDeps(sent, { name: "Old", tileColor: "#f7b6d2", profileComplete: true });
    await handleSetProfileMessage(deps);
    expect(setProfile).toHaveBeenCalled();
    expect(sent).not.toContainEqual(expect.objectContaining({ type: "ERROR" }));
  });
});

describe("SET_TILE_COLOR colour distance", () => {
  const tileDeps = (sent: unknown[], color: string) => {
    const setTileColor = vi.fn(async (_id: string, tileColor: string) => ({ tileColor }));
    const deps: SetTileColorMessageDeps = {
      playerId: "me",
      color,
      canToggleFog: false,
      buildTakenColorSet: async () => rosaTaken(),
      incrementColorCollisionRejectedTotal: () => {},
      profileStore: { setTileColor },
      invalidateProfileCache: () => {},
      profileOverrides: { upsert: (_id, patch) => patch },
      sendJson: (payload) => sent.push(payload),
      allSockets: () => [],
      socketsForPlayer: () => [],
      queueOrSendSessionPayload: () => {}
    };
    return { deps, setTileColor };
  };

  test("refuses a colour too close to a rival", async () => {
    const sent: unknown[] = [];
    const { deps, setTileColor } = tileDeps(sent, "#f7b6d2");
    await handleSetTileColorMessage(deps);
    expect(setTileColor).not.toHaveBeenCalled();
    expect(sent).toEqual([expect.objectContaining({ code: "COLOR_TAKEN", message: "Too close to Rosa's colour.", suggestion: expect.any(String) })]);
  });

  test("accepts a colour far from every rival", async () => {
    const sent: unknown[] = [];
    const { deps, setTileColor } = tileDeps(sent, "#1f77b4");
    await handleSetTileColorMessage(deps);
    expect(setTileColor).toHaveBeenCalledWith("me", "#1f77b4");
  });
});

import { describe, expect, it, vi } from "vitest";

import { handleSetCountryFlagMessage } from "./handle-set-country-flag-message.js";
import { createSeasonLobbyRoster } from "../season-lobby-roster/season-lobby-roster.js";

const buildDeps = (overrides: Partial<Parameters<typeof handleSetCountryFlagMessage>[0]> = {}) => {
  const sent: unknown[] = [];
  const lobbyRoster = createSeasonLobbyRoster();
  return {
    deps: {
      playerId: "player-1",
      countryFlag: "US",
      profileStore: { setCountryFlag: vi.fn(async () => ({ playerId: "player-1", name: "Alice", countryFlag: "US" })) },
      profileOverrides: {
        getOverride: () => ({ name: "Alice" }),
        getStoredProfile: async () => undefined,
        fallbackName: (playerId: string) => playerId,
        setCountryFlag: vi.fn()
      },
      invalidateProfileCache: vi.fn(),
      sendJson: (payload: unknown) => sent.push(payload),
      lobbyRoster,
      broadcastLobbyUpdate: vi.fn(),
      ...overrides
    },
    sent,
    lobbyRoster
  };
};

describe("handleSetCountryFlagMessage", () => {
  it("rejects an invalid flag", async () => {
    const { deps, sent } = buildDeps({ countryFlag: "USA" });
    await handleSetCountryFlagMessage(deps);
    expect(sent).toEqual([{ type: "ERROR", code: "COUNTRY_FLAG_INVALID", message: "Country flag must be a 2-letter code." }]);
    expect(deps.profileStore.setCountryFlag).not.toHaveBeenCalled();
  });

  it("rejects a non-string flag", async () => {
    const { deps, sent } = buildDeps({ countryFlag: 42 as unknown as string });
    await handleSetCountryFlagMessage(deps);
    expect((sent[0] as { code: string }).code).toBe("COUNTRY_FLAG_INVALID");
  });

  it("uppercases and accepts a valid 2-letter code", async () => {
    const { deps, sent } = buildDeps({ countryFlag: "us" });
    await handleSetCountryFlagMessage(deps);
    expect(deps.profileStore.setCountryFlag).toHaveBeenCalledWith("player-1", "US");
    expect(deps.profileOverrides.setCountryFlag).toHaveBeenCalledWith("player-1", "US");
    expect(sent).toEqual([{ type: "COUNTRY_FLAG_SET", countryFlag: "US" }]);
  });

  it("re-checks the player into the lobby roster and broadcasts when already waiting", async () => {
    const { deps, lobbyRoster } = buildDeps();
    lobbyRoster.checkIn("player-1", "Alice");
    await handleSetCountryFlagMessage(deps);
    expect(lobbyRoster.entries()).toEqual([{ playerId: "player-1", name: "Alice", countryFlag: "US" }]);
    expect(deps.broadcastLobbyUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not touch the roster or broadcast when the player isn't in the lobby", async () => {
    const { deps } = buildDeps();
    await handleSetCountryFlagMessage(deps);
    expect(deps.broadcastLobbyUpdate).not.toHaveBeenCalled();
  });
});

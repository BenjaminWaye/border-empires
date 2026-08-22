import { describe, expect, it } from "vitest";
import { isSeasonLobbyFullscreenActive } from "./client-season-lobby-fullscreen.js";

describe("isSeasonLobbyFullscreenActive", () => {
  it("is active only while the pending-season lobby is the open, needed overlay", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: true })
    ).toBe(true);
  });

  it("is inactive once the season stops being pending (player joined)", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: false })
    ).toBe(false);
  });

  it("is inactive when the overlay is closed", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: true, joinSeasonOverlayOpen: false, seasonPending: true })
    ).toBe(false);
  });

  it("is inactive when the player doesn't need to join a season", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: false, joinSeasonOverlayOpen: true, seasonPending: true })
    ).toBe(false);
  });
});

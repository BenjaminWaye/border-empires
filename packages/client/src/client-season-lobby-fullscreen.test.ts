import { describe, expect, it } from "vitest";
import { isSeasonLobbyFullscreenActive } from "./client-season-lobby-fullscreen.js";

describe("isSeasonLobbyFullscreenActive", () => {
  it("is active while the join-season overlay is the open, needed overlay (pending-season branch)", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: true, joinSeasonOverlayOpen: true })
    ).toBe(true);
  });

  it("is also active for the plain join-now branch -- both branches are the same full-screen shell", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: true, joinSeasonOverlayOpen: true })
    ).toBe(true);
  });

  it("is inactive when the overlay is closed", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: true, joinSeasonOverlayOpen: false })
    ).toBe(false);
  });

  it("is inactive when the player doesn't need to join a season", () => {
    expect(
      isSeasonLobbyFullscreenActive({ needsSeasonJoin: false, joinSeasonOverlayOpen: true })
    ).toBe(false);
  });
});

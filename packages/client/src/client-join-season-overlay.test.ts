// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderJoinSeasonOverlay } from "./client-join-season-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: false,
  joinSeasonOverlayOpen: false,
  joinSeasonId: "",
  joinSeasonPending: false,
  seasonLobbyWaitingCount: 0,
  seasonLobbyMaxPlayers: 0,
  seasonLobbyRoster: [],
  ...overrides
});

describe("join-season overlay", () => {
  it("is hidden when needsSeasonJoin is false", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState() as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("none");
    expect(overlayEl.innerHTML).toBe("");
  });

  it("is hidden when the player already dismissed it this session", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: false }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("none");
  });

  it("is hidden while profile setup (name/color) is still required, even when a season needs joining", () => {
    // Regression test: a brand-new player needs a name and tile color before
    // joining a season and appearing in its roster. The join-season overlay
    // going full-screen (setSeasonLobbyFullscreen) hides every #hud child
    // except itself, including #auth-overlay -- so if this overlay showed
    // itself before profile setup finished, the name/color picker had no
    // screen left to render on and silently never appeared.
    const overlayEl = document.createElement("div");
    document.body.classList.remove("season-lobby-active");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, profileSetupRequired: true }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("none");
    expect(overlayEl.innerHTML).toBe("");
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
  });

  it("renders the join prompt with the season id when needed", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("grid");
    expect(overlayEl.innerHTML).toContain("season-42");
    expect(overlayEl.querySelector("#join-season-confirm")).toBeTruthy();
  });

  it("calls joinSeason and marks pending when the confirm button is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" });
    const joinSeason = vi.fn(() => true);
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(state.joinSeasonPending).toBe(true);
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("closes the overlay when the close button is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true });
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason: () => true });
    const closeBtn = overlayEl.querySelector("#join-season-close") as HTMLButtonElement;
    closeBtn.click();
    expect(state.joinSeasonOverlayOpen).toBe(false);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("does not mark pending when joinSeason fails to send (e.g. not authed yet)", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true });
    const joinSeason = vi.fn(() => false);
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(state.joinSeasonPending).toBe(false);
  });

  it("does not re-trigger joinSeason while already pending", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonPending: true });
    const joinSeason = vi.fn(() => true);
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(joinSeason).not.toHaveBeenCalled();
  });

  it("shows the You're in confirmation, player count, and roster while pending", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({
        needsSeasonJoin: true,
        joinSeasonOverlayOpen: true,
        seasonPending: true,
        seasonPendingScheduledStartAt: Date.now() + 60_000,
        seasonLobbyWaitingCount: 3,
        seasonLobbyMaxPlayers: 120,
        seasonLobbyRoster: [
          { playerId: "p1", name: "Alice" },
          { playerId: "p2", name: "Bob" }
        ]
      }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.innerHTML).toContain("You're in");
    expect(overlayEl.innerHTML).toContain("3 / 120 PLAYERS");
    expect(overlayEl.innerHTML).toContain("Alice");
    expect(overlayEl.innerHTML).toContain("Bob");
    expect(overlayEl.querySelector("#season-lobby-discord")).toBeTruthy();
    expect(overlayEl.querySelector("#season-lobby-invite")).toBeTruthy();
  });

  it("shows a single clean title, not the raw season id duplicated, while pending", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({
        needsSeasonJoin: true,
        joinSeasonOverlayOpen: true,
        joinSeasonId: "season-8",
        seasonPending: true,
        seasonPendingScheduledStartAt: Date.now() + 60_000
      }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    const title = overlayEl.querySelector("#join-season-title") as HTMLElement;
    expect(title.textContent).toBe("Season starts soon");
    expect(title.textContent).not.toContain("season-8");
  });

  it("makes the lobby a full-screen page while pending, and restores the normal view once it stops being active", () => {
    document.body.classList.remove("season-lobby-active");
    const overlayEl = document.createElement("div");
    const state = makeState({
      needsSeasonJoin: true,
      joinSeasonOverlayOpen: true,
      seasonPending: true,
      seasonPendingScheduledStartAt: Date.now() + 60_000
    });
    renderJoinSeasonOverlay({
      state: state as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(document.body.classList.contains("season-lobby-active")).toBe(true);

    // Player joins: seasonPending clears, overlay closes -> back to the
    // normal game view, canvas/HUD no longer suppressed.
    renderJoinSeasonOverlay({
      state: makeState() as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
  });

  it("is ALSO full-screen for the plain join-now prompt -- both branches share the same war-room shell", () => {
    document.body.classList.remove("season-lobby-active");
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(document.body.classList.contains("season-lobby-active")).toBe(true);
  });

  it("plain join-now branch shows the invite actions alongside its Join button, without a countdown or a waiting count", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({
        needsSeasonJoin: true,
        joinSeasonOverlayOpen: true,
        joinSeasonId: "season-42",
        seasonLobbyWaitingCount: 5,
        seasonLobbyMaxPlayers: 100,
        seasonLobbyRoster: [{ playerId: "p1", name: "Alice" }]
      }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    // The season is already active here -- "waiting count"/roster describe
    // people holding a reserved spot for a world that hasn't started, which
    // doesn't apply once play is underway, so this branch must not show it.
    expect(overlayEl.innerHTML).not.toContain("PLAYERS WAITING");
    expect(overlayEl.innerHTML).not.toContain("PLAYERS</div>");
    expect(overlayEl.innerHTML).not.toContain("Alice");
    // Hasn't joined yet -- must not claim "You're in".
    expect(overlayEl.innerHTML).not.toContain("You're in");
    expect(overlayEl.querySelector("#join-season-confirm")).toBeTruthy();
    expect(overlayEl.querySelector("#season-lobby-discord")).toBeTruthy();
  });

  it("never renders a flag picker or flag emoji in either branch", () => {
    const overlayEl1 = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: true, seasonPendingScheduledStartAt: Date.now() + 60_000 }) as any,
      overlayEl: overlayEl1,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl1.querySelector("#season-lobby-flag-select")).toBeFalsy();

    const overlayEl2 = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true }) as any,
      overlayEl: overlayEl2,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl2.querySelector("#season-lobby-flag-select")).toBeFalsy();
  });

  it("skips rebuilding the DOM on a re-render with unchanged content (renderHud fires many times a second)", () => {
    // Regression test: rebuilding overlayEl.innerHTML on every renderHud()
    // pass -- most of which are triggered by ordinary socket/state traffic
    // unrelated to this overlay -- tore down and recreated the war-room
    // shell's cog element each time, restarting its CSS animation before it
    // ever completed a visible rotation ("vibrating instead of turning").
    // The same churn also wiped out the invite button's transient "Copied!"
    // feedback within milliseconds of a click, making it look like the
    // button did nothing.
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: true, seasonPendingScheduledStartAt: Date.now() + 60_000 }) as any;
    renderJoinSeasonOverlay({ state, overlayEl, renderHud: () => {}, joinSeason: () => true });
    const cogHost = overlayEl.querySelector(".respawn-modal");
    expect(cogHost).toBeTruthy();

    renderJoinSeasonOverlay({ state, overlayEl, renderHud: () => {}, joinSeason: () => true });
    expect(overlayEl.querySelector(".respawn-modal")).toBe(cogHost); // same node instance -- not torn down and recreated
  });

  it("does rebuild when the overlay's actual content changes (e.g. the roster updates)", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, seasonPending: true, seasonPendingScheduledStartAt: Date.now() + 60_000, seasonLobbyWaitingCount: 1 }) as any;
    renderJoinSeasonOverlay({ state, overlayEl, renderHud: () => {}, joinSeason: () => true });
    const firstNode = overlayEl.querySelector(".respawn-modal");

    state.seasonLobbyWaitingCount = 2;
    renderJoinSeasonOverlay({ state, overlayEl, renderHud: () => {}, joinSeason: () => true });
    expect(overlayEl.querySelector(".respawn-modal")).not.toBe(firstNode);
    expect(overlayEl.textContent).toContain("2");
  });
});

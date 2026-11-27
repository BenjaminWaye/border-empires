// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderJoinSeasonOverlay } from "../client-join-season-overlay.js";
import { applyEmailNotificationPrefsFromServer, getEmailNotificationPrefs } from "../client-email-notifications/client-email-notification-prefs-storage.js";
import { applyInitJoinScreenFields } from "../client-join-season-late-join/client-join-season-late-join.js";
import { waitingEmailHtml, waitingEmailStatus } from "./client-join-season-waiting.js";
import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";

vi.mock("../client-guest-save/client-guest-save-panel.js", () => ({ openGuestSavePanel: vi.fn() }));

// Regression: "Wait for the next contest" closed the card and left the player
// on an empty, fogged map with no word of what happens next.
const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-9", joinSeasonPending: false, joinSeasonWaiting: false,
  seasonPending: false, seasonPendingScheduledStartAt: 0, seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 0, seasonLobbyRoster: [],
  profileSetupRequired: false, seasonStartedAt: 0, singleContest: false, joinSeasonClosedMessage: "", sectorListRows: [], sectorListLoadedFor: "",
  authIsGuest: false, authEmail: "house@example.com",
  ...overrides
});

const mount = (state: ReturnType<typeof makeState>, joinSeason: () => boolean = () => true) => {
  const overlayEl = document.createElement("div");
  const renderHud = vi.fn(() => renderJoinSeasonOverlay({ state: state as never, overlayEl, renderHud, joinSeason }));
  renderHud();
  return { overlayEl, renderHud };
};

afterEach(() => {
  applyEmailNotificationPrefsFromServer({ seasonStart: true });
  document.getElementById("join-season-reopen")?.remove();
  document.body.classList.remove("season-lobby-active");
});

describe("waiting for the next contest", () => {
  it("keeps the card up on the waiting view instead of dropping the player on the empty map", () => {
    const state = makeState();
    const { overlayEl } = mount(state);
    (overlayEl.querySelector("#join-season-wait") as HTMLButtonElement).click();

    expect(state.joinSeasonOverlayOpen).toBe(true);
    expect(overlayEl.style.display).toBe("grid");
    expect(overlayEl.querySelector("#join-season-title")?.textContent).toBe("Waiting for the next contest");
    expect(overlayEl.querySelector("#join-season-confirm")?.textContent).toBe("Land now instead");
    expect(overlayEl.querySelector("#join-season-wait")).toBeNull();
  });

  it("confirms the New Sector Contest email when it is already on", () => {
    const state = makeState({ joinSeasonWaiting: true });
    const { overlayEl } = mount(state);
    expect(overlayEl.textContent).toContain("We'll email house@example.com when the next Sector Contest starts");
    expect(overlayEl.querySelector("#join-waiting-email")).toBeNull();
  });

  it("turns the New Sector Contest email on from the button and then confirms it", () => {
    applyEmailNotificationPrefsFromServer({ seasonStart: false });
    const state = makeState({ joinSeasonWaiting: true });
    const { overlayEl } = mount(state);

    (overlayEl.querySelector("#join-waiting-email") as HTMLButtonElement).click();

    expect(getEmailNotificationPrefs().seasonStart).toBe(true);
    expect(overlayEl.querySelector("#join-waiting-email")).toBeNull();
    expect(overlayEl.textContent).toContain("We'll email house@example.com");
  });

  it("sends a guest to save their empire, closing the card so the save panel shows", () => {
    const state = makeState({ joinSeasonWaiting: true, authIsGuest: true, authEmail: "" });
    const { overlayEl } = mount(state);
    const save = overlayEl.querySelector("#join-waiting-save") as HTMLButtonElement;
    expect(save.textContent).toBe("Save your empire to get an email");
    save.click();
    expect(state.joinSeasonOverlayOpen).toBe(false);
    expect(openGuestSavePanel).toHaveBeenCalledWith("contest-email");
  });

  it("lands from the waiting view", () => {
    const state = makeState({ joinSeasonWaiting: true });
    const joinSeason = vi.fn(() => true);
    const { overlayEl } = mount(state, joinSeason);
    (overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement).click();
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(state.joinSeasonPending).toBe(true);
    expect(state.joinSeasonWaiting).toBe(false);
    expect(overlayEl.querySelector("#join-season-confirm")?.classList.contains("is-joining")).toBe(true);
  });

  it("closes to the map, and the reopen button brings back the join card", () => {
    const state = makeState({ joinSeasonWaiting: true });
    const { overlayEl } = mount(state);
    (overlayEl.querySelector("#join-season-close") as HTMLButtonElement).click();
    expect(state.joinSeasonOverlayOpen).toBe(false);

    (document.getElementById("join-season-reopen") as HTMLButtonElement).click();
    expect(state.joinSeasonWaiting).toBe(false);
    expect(overlayEl.querySelector("#join-season-wait")).not.toBeNull();
  });

  it("a new INIT starts the next contest on the join card, not the waiting view", () => {
    const state = makeState({ joinSeasonWaiting: true });
    applyInitJoinScreenFields(state as never, {});
    expect(state.joinSeasonWaiting).toBe(false);
  });
});

describe("waitingEmailStatus", () => {
  it("covers guests, accounts without an email address, and the preference", () => {
    expect(waitingEmailStatus({ authIsGuest: true, authEmail: "", seasonStartEmailOn: true })).toBe("guest");
    expect(waitingEmailStatus({ authIsGuest: false, authEmail: " ", seasonStartEmailOn: true })).toBe("no-email");
    expect(waitingEmailStatus({ authIsGuest: false, authEmail: "a@b.c", seasonStartEmailOn: true })).toBe("on");
    expect(waitingEmailStatus({ authIsGuest: false, authEmail: "a@b.c", seasonStartEmailOn: false })).toBe("off");
  });

  it("escapes the address", () => {
    expect(waitingEmailHtml("on", "<b>@x.y")).toContain("&#60;b&#62;@x.y");
  });
});

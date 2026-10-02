// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credentialWithLink: vi.fn() },
  GoogleAuthProvider: { credentialFromError: vi.fn() },
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailLink: vi.fn(),
  signOut: vi.fn(),
  getAdditionalUserInfo: vi.fn()
}));
vi.mock("firebase/analytics", () => ({ logEvent: vi.fn() }));

import { initGuestSave, resetGuestSaveForTests } from "../client-guest-save/client-guest-save.js";
import { resetGuestSavePanelForTests } from "../client-guest-save/client-guest-save-panel.js";
import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

const sendError = (ws: FakeWebSocket, code: string, message: string): void => {
  ws.emit("message", { data: JSON.stringify({ type: "ERROR", code, message }) });
};

describe("a guest trying to make an alliance", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="hud"></div>';
    resetGuestSaveForTests();
    resetGuestSavePanelForTests();
    initGuestSave({
      firebaseAuth: { currentUser: { isAnonymous: true } } as never,
      googleProvider: {} as never,
      analytics: undefined,
      reload: vi.fn(),
      userAgent: () => "Mozilla/5.0 Safari/605.1.15",
      pageUrl: () => "https://play.example.test/"
    });
  });

  it("is offered the Save your empire panel instead of a bare error message", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendError(ws, "GUEST_DIPLOMACY_LOCKED", "Save your empire to a real account to make alliances and truces.");

    const panel = document.getElementById("guest-save-panel");
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain("Alliances and truces are for saved empires");
  });
});

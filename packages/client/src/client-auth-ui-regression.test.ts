import { describe, expect, it, vi } from "vitest";
import { syncAuthOverlay } from "./client-auth-ui.js";

const makeButton = (): HTMLButtonElement => ({ disabled: false } as HTMLButtonElement);
const makeInput = (): HTMLInputElement => ({ disabled: false, value: "" } as HTMLInputElement);
const makeElement = (): HTMLElement =>
  ({
    style: { display: "" },
    dataset: {},
    textContent: "",
    setAttribute: vi.fn()
  } as unknown as HTMLElement);

describe("syncAuthOverlay", () => {
  it("prefers explicit busy phase messaging over generic auth status copy", () => {
    const authOverlayEl = makeElement();
    const authBusyModalEl = makeElement();
    const authStatusEl = makeElement();
    const authBusyTitleEl = makeElement();
    const authBusyCopyEl = makeElement();
    authStatusEl.textContent = "Generic status";

    syncAuthOverlay(
      {
        authSessionReady: false,
        profileSetupRequired: false,
        authBusy: true,
        authConfigured: true,
        authError: "",
        authReady: true,
        authBusyTitle: "Securing session",
        authBusyDetail: "Game server reached. Verifying your Google session..."
      },
      {
        authOverlayEl,
        authBusyModalEl,
        authLoginBtn: makeButton(),
        authRegisterBtn: makeButton(),
        authEmailLinkBtn: makeButton(),
        authGoogleBtn: makeButton(),
        authEmailEl: makeInput(),
        authPasswordEl: makeInput(),
        authDisplayNameEl: makeInput(),
        authEmailResetBtn: makeButton(),
        authProfileNameEl: makeInput(),
        authProfileColorEl: makeInput(),
        authProfileSaveBtn: makeButton(),
        authBusyTitleEl,
        authBusyCopyEl,
        authStatusEl,
        syncAuthPanelState: vi.fn(),
        setAuthStatus: vi.fn()
      }
    );

    expect(authBusyTitleEl.textContent).toBe("Securing session");
    expect(authBusyCopyEl.textContent).toBe("Game server reached. Verifying your Google session...");
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";

vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));

// happy-dom has no real WebGL context, so the 3D scene assembler is mocked
// out here — this test covers gating/mount/toggle wiring only, which is the
// non-WebGL logic this module owns.
const setPlanets = vi.fn();
const resize = vi.fn();
const dispose = vi.fn();
vi.mock("./client-space-map-3d/client-space-map-3d.js", () => ({
  createSpaceScene: vi.fn(() => ({ setPlanets, resize, dispose }))
}));

const { mountSpaceView } = await import("./client-space-view.js");

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const fakeAuth = () =>
  ({ currentUser: { getIdToken: vi.fn().mockResolvedValue("test-token") } }) as unknown as import("firebase/auth").Auth;

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((el) => el.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mountSpaceView gating", () => {
  it("mounts nothing when the account owns zero galaxy planets", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ planets: [] }) })
    );

    const state = createInitialState();
    mountSpaceView({ state, firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
    await flushAsync();

    expect(state.spaceViewEligible).toBe(false);
    expect(document.querySelector("[data-space-view-launcher]")).toBeNull();
    expect(document.querySelector(".sv-screen")).toBeNull();
  });

  it("mounts the launcher and screen as siblings of #hud when a planet is owned", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/hq/galaxy/me")) {
          return Promise.resolve({ ok: true, json: async () => ({ planets: [{ seasonId: "s1" }] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ planets: [], outposts: [] }) });
      })
    );

    const state = createInitialState();
    mountSpaceView({ state, firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
    await flushAsync();

    expect(state.spaceViewEligible).toBe(true);
    const launcher = document.querySelector("[data-space-view-launcher]");
    const screen = document.querySelector(".sv-screen");
    expect(launcher).not.toBeNull();
    expect(screen).not.toBeNull();
    // Siblings of #hud, not children — see the module's stacking-order note.
    expect(launcher?.parentElement).toBe(document.body);
    expect(screen?.parentElement).toBe(document.body);
    expect((screen as HTMLElement).hidden).toBe(true);
  });

  it("toggles activeScreen and #hud visibility via the launcher and return button", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/hq/galaxy/me")) {
          return Promise.resolve({ ok: true, json: async () => ({ planets: [{ seasonId: "s1" }] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ planets: [], outposts: [] }) });
      })
    );

    const state = createInitialState();
    mountSpaceView({ state, firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
    await flushAsync();

    const launcher = document.querySelector<HTMLButtonElement>("[data-space-view-launcher]")!;
    launcher.click();
    expect(state.activeScreen).toBe("space");
    expect(hud.style.visibility).toBe("hidden");
    expect(document.querySelector(".sv-screen")).not.toHaveProperty("hidden", true);

    const returnBtn = document.querySelector<HTMLButtonElement>("[data-space-view-return]")!;
    returnBtn.click();
    expect(state.activeScreen).toBe("season");
    expect(hud.style.visibility).toBe("");
  });
});

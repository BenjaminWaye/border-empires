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

  it("toggles activeScreen and #hud visibility via the dual-purpose launcher button", async () => {
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
    expect(launcher.title).toBe("Open Space View");
    launcher.click();
    expect(state.activeScreen).toBe("space");
    expect(hud.style.visibility).toBe("hidden");
    expect(document.querySelector(".sv-screen")).not.toHaveProperty("hidden", true);
    expect(launcher.title).toBe("Return to Season");

    // The same button, clicked again, is now the return action -- there is
    // no separate "Return to Season" button in the chrome.
    launcher.click();
    expect(state.activeScreen).toBe("season");
    expect(hud.style.visibility).toBe("");
    expect(launcher.title).toBe("Open Space View");
  });

  it("marks the account's own Outpost as owned in the scene, not just its Planets", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/hq/galaxy/me")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ planets: [{ seasonId: "s1" }], outposts: [{ seasonId: "s2" }] })
          });
        }
        // Public listing: both worlds this account holds show up here too,
        // alongside a third, unrelated world.
        return Promise.resolve({
          ok: true,
          json: async () => ({
            planets: [{ seasonId: "s1", tier: "PLANET" }],
            outposts: [
              { seasonId: "s2", tier: "OUTPOST" },
              { seasonId: "s3", tier: "OUTPOST" }
            ]
          })
        });
      })
    );

    const state = createInitialState();
    mountSpaceView({ state, firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
    // Needs more microtask hops than the 3-tick flushAsync covers: this is
    // the only test in the file that waits on the *second* fetch (the
    // public galaxy listing) resolving, not just the first (/hq/galaxy/me).
    await flushAsync();
    await flushAsync();

    expect(setPlanets).toHaveBeenCalledTimes(1);
    const models = setPlanets.mock.calls[0]![0] as Array<{ seasonId: string; state: string }>;
    const stateOf = (seasonId: string): string | undefined => models.find((m) => m.seasonId === seasonId)?.state;
    expect(stateOf("s1")).toBe("owned"); // my Planet
    expect(stateOf("s2")).toBe("owned"); // my Outpost -- was mis-tagged as "other" before this fix
    expect(stateOf("s3")).not.toBe("owned"); // someone else's Outpost
  });

  it("calls openGalaxyManage from the Manage Planet button instead of mounting a second launcher", async () => {
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

    const openGalaxyManage = vi.fn();
    const state = createInitialState();
    mountSpaceView({ state, firebaseAuth: fakeAuth(), wsUrl: "wss://example.test", openGalaxyManage });
    await flushAsync();

    document.querySelector<HTMLButtonElement>("[data-space-view-manage-planet]")!.click();
    expect(openGalaxyManage).toHaveBeenCalledTimes(1);
  });

  it("shows the account's real Influence/Production balance, not the season resource ribbon", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/hq/galaxy/me")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ planets: [{ seasonId: "s1" }], economy: { influence: 37, production: 50 } })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ planets: [], outposts: [] }) });
      })
    );

    const state = createInitialState();
    mountSpaceView({ state, firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
    await flushAsync();

    const stats = document.querySelector("[data-space-view-stats]")!;
    expect(stats.textContent).toContain("37");
    expect(stats.textContent).toContain("Influence");
    expect(stats.textContent).toContain("50");
    expect(stats.textContent).toContain("Production");
    // None of the season's tile-game resources belong in this screen.
    expect(stats.textContent).not.toMatch(/FOOD|TITANIUM|CRYSTAL|UMBRITE|SHARD/);
  });

  it("shows 0/0 (not an error) when the gateway has no economy balance wired yet", async () => {
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

    const stats = document.querySelector("[data-space-view-stats]")!;
    expect(stats.textContent).toContain("Influence");
    expect(stats.textContent).toContain("Production");
  });
});

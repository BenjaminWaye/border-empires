// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

// #hud is `position:fixed`, which per the CSS stacking rules creates its own
// stacking context regardless of z-index. A regression here (mounting into
// document.body instead of #hud) would make the launcher/overlay's z-index
// paint above #hud's *entire* subtree — including the login screen — no
// matter what number is used. See client-galaxy-view.ts for the full
// explanation.
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));

const { mountGalaxyView } = await import("./client-galaxy-view.js");

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

describe("mountGalaxyView", () => {
  it("mounts the launcher and overlay as children of #hud, not document.body", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planets: [
            { seasonId: "season-1", seasonSequence: 1, objectiveName: "Conquest", crownedAt: 1_700_000_000_000, planetName: null, named: false }
          ]
        })
      })
    );

    mountGalaxyView({ firebaseAuth: fakeAuth(), wsUrl: "ws://127.0.0.1:3101/ws" });
    await flushAsync();

    expect(hud.querySelector(".gx-launcher")).not.toBeNull();
    expect(hud.querySelector(".gx-overlay")).not.toBeNull();
    // Confirms it did NOT fall back to document.body (only #hud's children).
    const directBodyChildren = Array.from(document.body.children);
    expect(directBodyChildren.some((el) => el.classList.contains("gx-launcher"))).toBe(false);
  });

  it("falls back to document.body when #hud is not present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planets: [
            { seasonId: "season-1", seasonSequence: 1, objectiveName: "Conquest", crownedAt: 1_700_000_000_000, planetName: null, named: false }
          ]
        })
      })
    );

    mountGalaxyView({ firebaseAuth: fakeAuth(), wsUrl: "ws://127.0.0.1:3101/ws" });
    await flushAsync();

    expect(document.body.querySelector(".gx-launcher")).not.toBeNull();
  });

  it("does not mount anything when the account owns no planets", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ planets: [] }) }));

    mountGalaxyView({ firebaseAuth: fakeAuth(), wsUrl: "ws://127.0.0.1:3101/ws" });
    await flushAsync();

    expect(hud.querySelector(".gx-launcher")).toBeNull();
  });
});

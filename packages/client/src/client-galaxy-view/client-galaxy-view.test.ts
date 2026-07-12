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

  it("fetches /hq/galaxy/emperor on mount", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/hq/galaxy/emperor")) {
        return {
          ok: true,
          json: async () => ({ ok: true, emperor: null, windowOpenUntil: null, endorsement: null, isEmperor: false })
        };
      }
      return {
        ok: true,
        json: async () => ({
          planets: [
            { seasonId: "season-1", seasonSequence: 1, objectiveName: "Conquest", crownedAt: 1_700_000_000_000, planetName: "Aethelgard", named: true }
          ]
        })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    mountGalaxyView({ firebaseAuth: fakeAuth(), wsUrl: "ws://127.0.0.1:3101/ws" });
    await flushAsync();

    const emperorCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/hq/galaxy/emperor"));
    expect(emperorCalls.length).toBeGreaterThan(0);
  });

  it("renders the Emperor endorsement form and posts to /hq/galaxy/endorse on submit", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);

    const windowOpenUntil = Date.now() + 30 * 60_000;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/hq/galaxy/emperor")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            emperor: { playerId: "player-1", endedSeasonId: "season-1", crownedAt: 1_700_000_000_000 },
            windowOpenUntil,
            endorsement: null,
            isEmperor: true
          })
        };
      }
      if (url.endsWith("/hq/galaxy/endorse")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body).toEqual({ targetEmail: "friend@example.com" });
        return {
          ok: true,
          json: async () => ({ ok: true, endorsement: { targetPlayerId: "player-2", createdAt: Date.now() } })
        };
      }
      return {
        ok: true,
        json: async () => ({
          planets: [
            { seasonId: "season-1", seasonSequence: 1, objectiveName: "Conquest", crownedAt: 1_700_000_000_000, planetName: "Aethelgard", named: true }
          ]
        })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    mountGalaxyView({ firebaseAuth: fakeAuth(), wsUrl: "ws://127.0.0.1:3101/ws" });
    await flushAsync();

    const launcher = hud.querySelector<HTMLButtonElement>(".gx-launcher");
    launcher?.click();

    const form = hud.querySelector<HTMLFormElement>("[data-galaxy-endorse-form]");
    expect(form).not.toBeNull();
    const input = hud.querySelector<HTMLInputElement>("[data-galaxy-endorse-target]");
    expect(input).not.toBeNull();
    input!.value = "friend@example.com";

    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsync();

    const endorseCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/hq/galaxy/endorse"));
    expect(endorseCalls.length).toBe(1);
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";

vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));

// happy-dom has no WebGL, so the 3D scene is mocked; these tests cover only
// how Space View wires the 2D strategic map (design doc §22) to it.
const setPlanets = vi.fn();
const resetView = vi.fn();
const focusSystem = vi.fn();
let zoomedOutCallback: (() => void) | undefined;
const onZoomedOut = vi.fn((callback: () => void) => {
  zoomedOutCallback = callback;
});
vi.mock("./client-space-map-3d/client-space-map-3d.js", () => ({
  createSpaceScene: vi.fn(() => ({
    setPlanets,
    setFleetOrders: vi.fn(),
    setThreats: vi.fn(),
    resetView,
    focusSystem,
    onZoomedOut,
    resize: vi.fn(),
    dispose: vi.fn()
  }))
}));

const { mountSpaceView } = await import("./client-space-view.js");

const flushAsync = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const fakeAuth = () =>
  ({ currentUser: { getIdToken: vi.fn().mockResolvedValue("test-token") } }) as unknown as import("firebase/auth").Auth;

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((el) => el.remove());
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setPlanets.mockClear();
  resetView.mockClear();
  focusSystem.mockClear();
  onZoomedOut.mockClear();
  zoomedOutCallback = undefined;
});

const mountWithPlanets = async (): Promise<HTMLElement> => {
  const hud = document.createElement("div");
  hud.id = "hud";
  document.body.append(hud);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/hq/galaxy/me")) {
        return Promise.resolve({ ok: true, json: async () => ({ planets: [{ seasonId: "s1", planetName: "Aurelia", named: true }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ planets: [{ seasonId: "s1", tier: "PLANET", planetName: "Aurelia" }], outposts: [] }) });
    })
  );
  mountSpaceView({ state: createInitialState(), firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
  await flushAsync();
  return document.querySelector(".sv-screen") as HTMLElement;
};

const strategicCanvas = (screen: HTMLElement): HTMLCanvasElement =>
  screen.querySelector<HTMLCanvasElement>("[data-space-view-strategic-canvas]")!;

describe("strategic map wiring (§22)", () => {
  it("mounts a hidden 2D strategic canvas and subscribes to the 3D zoom-out signal", async () => {
    const screen = await mountWithPlanets();
    expect(strategicCanvas(screen).hidden).toBe(true);
    expect(onZoomedOut).toHaveBeenCalledTimes(1);
  });

  it("reveals the strategic map when the 3D camera is zoomed out past the wide view", async () => {
    const screen = await mountWithPlanets();
    zoomedOutCallback?.();
    expect(strategicCanvas(screen).hidden).toBe(false);
  });

  it("the Strategic Map button toggles the map, and closing it flies back to the wide view", async () => {
    const screen = await mountWithPlanets();
    const button = screen.querySelector<HTMLButtonElement>("[data-space-view-strategic-map]")!;
    button.click();
    expect(strategicCanvas(screen).hidden).toBe(false);
    button.click();
    expect(strategicCanvas(screen).hidden).toBe(true);
    expect(resetView).toHaveBeenCalledTimes(1);
  });

  it("Galaxy View hides the strategic map", async () => {
    const screen = await mountWithPlanets();
    zoomedOutCallback?.();
    screen.querySelector<HTMLButtonElement>("[data-space-view-galaxy-view]")!.click();
    expect(strategicCanvas(screen).hidden).toBe(true);
    expect(resetView).toHaveBeenCalled();
  });

  it("zooming the wheel in over the map closes it and flies back to the wide view", async () => {
    const screen = await mountWithPlanets();
    zoomedOutCallback?.();
    strategicCanvas(screen).dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    expect(strategicCanvas(screen).hidden).toBe(true);
    expect(resetView).toHaveBeenCalledTimes(1);
  });

  it("feeds the loaded planets to the 3D scene alongside the map", async () => {
    await mountWithPlanets();
    expect(setPlanets).toHaveBeenCalled();
  });
});

describe("top-bar stats", () => {
  it("show the Duke's real Influence and daily Production rate, not the always-zero weekly balance", async () => {
    const hud = document.createElement("div");
    hud.id = "hud";
    document.body.append(hud);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/hq/galaxy/me")) return Promise.resolve({ ok: true, json: async () => ({ planets: [{ seasonId: "s1" }], economy: { influence: 3, production: 0 } }) });
        if (url.includes("/hq/galaxy/duke")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, duke: { now: 0, influence: 7, systems: [{ ratePerDay: 6 }, { ratePerDay: 2.5 }], attention: [], flights: [], orbiting: [], intel: [], petition: { available: true, availableAt: null }, court: { start: 300, current: 280, fallen: false, capturedSectors: 2, committedInfluence: 0, myContribution: 0, offer: { status: "DECLINED", protectedUntil: null, moveLockedUntil: null }, canMoveAgainstCourt: true, minWager: 5 }, meters: { domainWeight: 1, rank: 1, dukeCount: 1 }, economy: { developmentUpkeepPerCycle: 0, incursionsPerCyclePerSystem: 3, wardenPoolPerCycle: 3 }, digest: [] } }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ planets: [], outposts: [] }) });
      })
    );
    mountSpaceView({ state: createInitialState(), firebaseAuth: fakeAuth(), wsUrl: "wss://example.test" });
    await flushAsync();
    await flushAsync();
    const stats = document.querySelector("[data-space-view-stats]")!.textContent!;
    expect(stats).toContain("7");
    expect(stats).toContain("8.5/day");
    expect(stats).not.toContain("0Production");
  });
});

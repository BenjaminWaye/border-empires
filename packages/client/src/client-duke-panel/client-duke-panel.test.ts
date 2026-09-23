// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DukeApi } from "./client-duke-api.js";
import { mountDukeController } from "./client-duke-panel.js";
import { NOW, dukeStatus } from "./client-duke-fixtures.js";
import type { DukeStatus } from "./client-duke-types.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const H = 60 * 60 * 1000;
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const setup = async (status: DukeStatus | "not-a-duke" = dukeStatus(), apiPatch: Partial<DukeApi> = {}) => {
  const screen = document.createElement("div");
  const panel = document.createElement("div");
  document.body.append(screen, panel);
  let current = status;
  const ok = async () => ({ ok: true as const });
  const api: DukeApi = {
    fetchStatus: vi.fn(async () => (current === "not-a-duke" ? { notADuke: true } : { status: current })),
    invest: vi.fn(ok),
    cancelBuild: vi.fn(ok),
    order: vi.fn(ok),
    answerOffer: vi.fn(ok),
    moveAgainstCourt: vi.fn(ok),
    ...apiPatch
  };
  const openPanel = vi.fn();
  const controller = mountDukeController(screen, panel, {
    wsUrl: "wss://example.test",
    getIdToken: async () => "t",
    getTargetOptions: () => [{ seasonId: "season-b", label: "Kel" }],
    openPanel,
    now: () => NOW,
    api,
    refreshIntervalMs: 3_600_000
  });
  await controller.refresh();
  return { screen, panel, api, controller, openPanel, setStatus: (s: DukeStatus) => (current = s) };
};

const click = (root: HTMLElement, selector: string): void => root.querySelector<HTMLElement>(selector)!.click();

describe("mountDukeController", () => {
  it("shows the HUD for a Duke and hides it for someone who isn't one", async () => {
    const duke = await setup();
    expect(duke.screen.querySelector<HTMLElement>("[data-duke-hud]")!.hidden).toBe(false);
    expect(duke.screen.textContent).toContain("Choose one action this Cycle");
    expect(duke.controller.isDuke()).toBe(true);
    const stranger = await setup("not-a-duke");
    expect(stranger.screen.querySelector<HTMLElement>("[data-duke-hud]")!.hidden).toBe(true);
    expect(stranger.controller.isDuke()).toBe(false);
  });

  it("reports every refreshed status to onStatus, and undefined for a non-Duke", async () => {
    const seen: Array<DukeStatus | undefined> = [];
    const screen = document.createElement("div");
    const panel = document.createElement("div");
    document.body.append(screen, panel);
    let current: DukeStatus | "not-a-duke" = dukeStatus();
    const controller = mountDukeController(screen, panel, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "t",
      getTargetOptions: () => [],
      openPanel: () => undefined,
      now: () => NOW,
      onStatus: (s) => seen.push(s),
      api: {
        fetchStatus: async () => (current === "not-a-duke" ? { notADuke: true } : { status: current }),
        invest: async () => ({ ok: true }),
        cancelBuild: async () => ({ ok: true }),
        order: async () => ({ ok: true }),
        answerOffer: async () => ({ ok: true }),
        moveAgainstCourt: async () => ({ ok: true })
      },
      refreshIntervalMs: 3_600_000
    });
    await controller.refresh();
    current = "not-a-duke";
    await controller.refresh();
    expect(seen[0]?.influence).toBe(12);
    expect(seen[1]).toBeUndefined();
  });

  it("the banner's Open button opens the panel", async () => {
    const { screen, openPanel } = await setup();
    click(screen, "[data-duke-open]");
    expect(openPanel).toHaveBeenCalledTimes(1);
  });

  it("Invest buttons send the right build and refresh", async () => {
    const { panel, api } = await setup();
    click(panel, '[data-duke-invest="FIGHTER"]');
    click(panel, '[data-duke-invest="PROBE"]');
    await flush();
    expect(api.invest).toHaveBeenNthCalledWith(1, { kind: "FIGHTER" });
    expect(api.invest).toHaveBeenNthCalledWith(2, { kind: "PROBE" });
    expect(api.fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("Fortify sends the chosen Sector and points", async () => {
    const { panel, api } = await setup();
    const points = panel.querySelector<HTMLInputElement>("[data-duke-fortify-points]")!;
    points.value = "15";
    click(panel, "[data-duke-fortify]");
    await flush();
    expect(api.invest).toHaveBeenCalledWith({ kind: "FORTIFY", seasonId: "s1", points: 15 });
  });

  it("a refused action shows a plain-language message, never the raw code", async () => {
    const { panel } = await setup(dukeStatus(), {
      invest: async () => ({ ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt: NOW + 26 * H })
    });
    click(panel, '[data-duke-invest="FIGHTER"]');
    await flush();
    const message = panel.querySelector<HTMLElement>("[data-duke-message]")!;
    expect(message.hidden).toBe(false);
    expect(message.textContent).toContain("You've used your action for this Cycle");
    expect(message.textContent).toContain("1d 2h");
    expect(message.textContent).not.toContain("ACTION_ALREADY");
  });

  it("network and HTTP failures fall back to their own message", async () => {
    const { panel } = await setup(dukeStatus(), { invest: async () => ({ ok: false, code: "NETWORK", message: "Could not reach the server. Try again." }) });
    click(panel, '[data-duke-invest="PROBE"]');
    await flush();
    expect(panel.querySelector("[data-duke-message]")!.textContent).toBe("Could not reach the server. Try again.");
  });

  it("answers the Court offer", async () => {
    const pending = dukeStatus({ court: { ...dukeStatus().court, offer: { status: "PENDING", protectedUntil: null, moveLockedUntil: null } } });
    const { panel, api } = await setup(pending);
    click(panel, '[data-duke-offer-answer="accept"]');
    await flush();
    expect(api.answerOffer).toHaveBeenCalledWith(true);
  });

  it("Move Against the Court sends the wager", async () => {
    const { panel, api } = await setup();
    panel.querySelector<HTMLInputElement>("[data-duke-court-wager]")!.value = "20";
    click(panel, "[data-duke-court-move]");
    await flush();
    expect(api.moveAgainstCourt).toHaveBeenCalledWith(20);
  });

  it("launches a Probe or a Raid at the selected target", async () => {
    const ready = dukeStatus({
      ships: { fighterHulls: [100], probeStock: 1, inFlight: null, orbiting: [] },
      intel: [{ seasonId: "season-b", label: "Kel", stability: 80, defenderHull: null, at: NOW, live: true }]
    });
    const { panel, api } = await setup(ready);
    click(panel, '[data-duke-order-launch="PROBE"]');
    click(panel, '[data-duke-order-launch="RAID"]');
    await flush();
    expect(api.order).toHaveBeenNthCalledWith(1, { kind: "PROBE", seasonId: "season-b" });
    expect(api.order).toHaveBeenNthCalledWith(2, { kind: "RAID", seasonId: "season-b" });
  });

  it("disabled buttons do nothing", async () => {
    const { panel, api } = await setup(dukeStatus({ gate: { available: false, availableAt: NOW + H, cycleMs: 1 } }));
    click(panel, '[data-duke-invest="FIGHTER"]');
    await flush();
    expect(api.invest).not.toHaveBeenCalled();
  });

  it("does not rebuild the panel under a focused input during a refresh", async () => {
    const { panel, controller } = await setup();
    const wager = panel.querySelector<HTMLInputElement>("[data-duke-court-wager]")!;
    wager.focus();
    wager.value = "42";
    await controller.refresh();
    expect(panel.querySelector<HTMLInputElement>("[data-duke-court-wager]")!.value).toBe("42");
  });

  it("reflects a used weekly action after refresh", async () => {
    const duke = await setup();
    duke.setStatus(dukeStatus({ gate: { available: false, availableAt: NOW + 5 * 24 * H, cycleMs: 1 } }));
    await duke.controller.refresh();
    expect(duke.screen.textContent).toContain("Your action is used");
  });
});

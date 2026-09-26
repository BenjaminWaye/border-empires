// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DukeApi } from "./client-duke-api.js";
import { mountDukeController } from "./client-duke-panel.js";
import { H, NOW, buildOption, dukeStatus, dukeSystem } from "./client-duke-fixtures.js";
import type { DukeStatus } from "./client-duke-types.js";

afterEach(() => {
  document.body.innerHTML = "";
});

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
    build: vi.fn(ok),
    cancelBuild: vi.fn(ok),
    order: vi.fn(ok),
    answerOffer: vi.fn(ok),
    moveAgainstCourt: vi.fn(ok),
    ...apiPatch
  };
  const openPanel = vi.fn();
  const seen: Array<DukeStatus | undefined> = [];
  const controller = mountDukeController(screen, panel, {
    wsUrl: "wss://example.test",
    getIdToken: async () => "t",
    getTargetOptions: () => [{ seasonId: "season-b", label: "Kel" }],
    openPanel,
    now: () => NOW,
    api,
    onStatus: (s) => seen.push(s),
    refreshIntervalMs: 3_600_000
  });
  await controller.refresh();
  return { screen, panel, api, controller, openPanel, seen, setStatus: (s: DukeStatus) => (current = s) };
};

const click = (root: HTMLElement, selector: string): void => root.querySelector<HTMLElement>(selector)!.click();
const surveyed = { seasonId: "season-b", label: "Kel", stability: 80, defenderHull: null, at: NOW, live: true };

describe("HUD", () => {
  it("shows for a Duke and hides for someone who isn't one", async () => {
    const duke = await setup();
    expect(duke.screen.querySelector<HTMLElement>("[data-duke-hud]")!.hidden).toBe(false);
    expect(duke.controller.isDuke()).toBe(true);
    const stranger = await setup("not-a-duke");
    expect(stranger.screen.querySelector<HTMLElement>("[data-duke-hud]")!.hidden).toBe(true);
    expect(stranger.controller.isDuke()).toBe(false);
  });
  it("reports every refreshed status to onStatus, and undefined for a non-Duke", async () => {
    const duke = await setup();
    expect(duke.seen[0]?.influence).toBe(12);
    const stranger = await setup("not-a-duke");
    expect(stranger.seen[0]).toBeUndefined();
  });
  it("pressing an attention line opens the panel on that planet; Court items open the Court tab", async () => {
    const status = dukeStatus({
      systems: [dukeSystem(), dukeSystem({ seasonId: "s2", label: "Vex" })],
      attention: [
        { kind: "SLOT_EMPTY", severity: "NOTICE", seasonId: "s2", label: "Vex", at: null },
        { kind: "COURT_OFFER", severity: "URGENT", seasonId: null, label: "The Court", at: null }
      ]
    });
    const { screen, panel, openPanel } = await setup(status);
    click(screen, '[data-duke-attention="SLOT_EMPTY"]');
    expect(openPanel).toHaveBeenCalledTimes(1);
    expect(panel.textContent).toContain("Vex");
    expect(panel.querySelector('[data-duke-system="s2"]')).not.toBeNull();
    click(screen, '[data-duke-attention="COURT_OFFER"]');
    expect(panel.querySelector("[data-duke-court]")).not.toBeNull();
  });
});

describe("one panel, three entry points", () => {
  it("starts on the planet; showTab swaps in Court and Log, with no tab bar to switch by hand", async () => {
    const { panel, controller } = await setup();
    expect(panel.querySelector("[data-duke-system]")).not.toBeNull();
    expect(panel.querySelector("[role=tablist]")).toBeNull();
    expect(panel.querySelector("[data-duke-title]")!.textContent).toContain("Aurelia");
    controller.showTab("COURT");
    expect(panel.querySelector("[data-duke-petition]")).not.toBeNull();
    controller.showTab("LOG");
    expect(panel.querySelector("[data-duke-digest]")).not.toBeNull();
    controller.showTab("SYSTEM");
    expect(panel.querySelector("[data-duke-build]")).not.toBeNull();
  });
  it("showSystem opens the panel on a planet you press on the map", async () => {
    const two = dukeStatus({ systems: [dukeSystem(), dukeSystem({ seasonId: "s2", label: "Vex" })] });
    const { panel, controller, openPanel } = await setup(two);
    controller.showSystem("s2");
    expect(openPanel).toHaveBeenCalled();
    expect(panel.querySelector('[data-duke-system="s2"]')).not.toBeNull();
  });
  it("pressing a ship shows its order form; pressing it again hides it", async () => {
    const { panel } = await setup(dukeStatus({ systems: [dukeSystem({ fighters: [100], probeStock: 1 })] }));
    expect(panel.querySelector("[data-duke-raid-target]")).toBeNull();
    click(panel, '[data-duke-ship="FIGHTER"]');
    expect(panel.querySelector("[data-duke-raid-target]")).not.toBeNull();
    click(panel, '[data-duke-ship="PROBE"]');
    expect(panel.querySelector("[data-duke-raid-target]")).toBeNull();
    expect(panel.querySelector("[data-duke-probe-target]")).not.toBeNull();
    click(panel, '[data-duke-ship="PROBE"]');
    expect(panel.querySelector("[data-duke-probe-target]")).toBeNull();
  });
});

describe("actions send exactly what was pressed, for the planet shown", () => {
  it("build options", async () => {
    const { panel, api } = await setup();
    click(panel, '[data-duke-build="FIGHTER"]');
    click(panel, '[data-duke-build="PROBE"]');
    await flush();
    expect(api.build).toHaveBeenNthCalledWith(1, "s1", { kind: "FIGHTER" });
    expect(api.build).toHaveBeenNthCalledWith(2, "s1", { kind: "PROBE" });
  });
  it("developing a body sends its index", async () => {
    const { panel, api } = await setup();
    click(panel, '[data-duke-develop="0"]');
    await flush();
    expect(api.build).toHaveBeenCalledWith("s1", { kind: "DEVELOP", bodyIndex: 0 });
  });
  it("Fortify sends the slider's points, and the readout follows the slider", async () => {
    const { panel, api } = await setup();
    const slider = panel.querySelector<HTMLInputElement>("[data-duke-fortify-points]")!;
    slider.value = "15";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panel.querySelector("[data-duke-fortify-output]")!.textContent).toBe("+15");
    click(panel, "[data-duke-fortify]");
    await flush();
    expect(api.build).toHaveBeenCalledWith("s1", { kind: "FORTIFY", points: 15 });
  });
  it("cancel", async () => {
    const busy = dukeStatus({ systems: [dukeSystem({ slot: { kind: "FIGHTER", label: "Fighter", cost: 80, progress: 10, daysLeft: 12 } })] });
    const { panel, api } = await setup(busy);
    click(panel, "[data-duke-cancel-build]");
    await flush();
    expect(api.cancelBuild).toHaveBeenCalledWith("s1");
  });
  it("a Probe launches from the planet at the chosen target and deselects", async () => {
    const { panel, api } = await setup(dukeStatus({ systems: [dukeSystem({ probeStock: 1 })] }));
    click(panel, '[data-duke-ship="PROBE"]');
    click(panel, '[data-duke-order-launch="PROBE"]');
    await flush();
    expect(api.order).toHaveBeenCalledWith("s1", { kind: "PROBE", targetSeasonId: "season-b" });
    expect(panel.querySelector("[data-duke-probe-target]")).toBeNull();
  });
  it("a Fighter raids a surveyed system", async () => {
    const { panel, api } = await setup(dukeStatus({ systems: [dukeSystem({ fighters: [100] })], intel: [surveyed] }));
    click(panel, '[data-duke-ship="FIGHTER"]');
    click(panel, '[data-duke-order-launch="RAID"]');
    await flush();
    expect(api.order).toHaveBeenCalledWith("s1", { kind: "RAID", targetSeasonId: "season-b" });
  });
  it("answers the Court offer and wagers against the Court", async () => {
    const offer = dukeStatus({ court: { ...dukeStatus().court, offer: { status: "PENDING", protectedUntil: null, moveLockedUntil: null } } });
    const { panel, api, controller } = await setup(offer);
    controller.showTab("COURT");
    click(panel, '[data-duke-offer-answer="accept"]');
    await flush();
    expect(api.answerOffer).toHaveBeenCalledWith(true);
    controller.showTab("COURT");
    panel.querySelector<HTMLInputElement>("[data-duke-court-wager]")!.value = "20";
    click(panel, "[data-duke-court-move]");
    await flush();
    expect(api.moveAgainstCourt).toHaveBeenCalledWith(20);
  });
  it("disabled options do nothing", async () => {
    const blocked = dukeStatus({ systems: [dukeSystem({ options: [buildOption({ blockedBy: "SLOT_BUSY" })] })] });
    const { panel, api } = await setup(blocked);
    click(panel, '[data-duke-build="FIGHTER"]');
    await flush();
    expect(api.build).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  it("show a plain-language message, never the raw code", async () => {
    const { panel } = await setup(dukeStatus(), { build: async () => ({ ok: false, code: "SLOT_BUSY" }) });
    click(panel, '[data-duke-build="FIGHTER"]');
    await flush();
    const message = panel.querySelector<HTMLElement>("[data-duke-message]")!;
    expect(message.hidden).toBe(false);
    expect(message.textContent).toContain("already building something");
    expect(message.textContent).not.toContain("SLOT_BUSY");
  });
  it("the Petition limit says when it opens again", async () => {
    const { panel, controller } = await setup(dukeStatus(), { moveAgainstCourt: async () => ({ ok: false, code: "PETITION_ALREADY_MADE_THIS_CYCLE", availableAt: NOW + 26 * H }) });
    controller.showTab("COURT");
    click(panel, "[data-duke-court-move]");
    await flush();
    expect(panel.querySelector("[data-duke-message]")!.textContent).toMatch(/1d 2h/);
  });
  it("network failures show their own message", async () => {
    const { panel } = await setup(dukeStatus(), { build: async () => ({ ok: false, code: "NETWORK", message: "Could not reach the server. Try again." }) });
    click(panel, '[data-duke-build="PROBE"]');
    await flush();
    expect(panel.querySelector("[data-duke-message]")!.textContent).toBe("Could not reach the server. Try again.");
  });
});

describe("a system that is not yours", () => {
  const target = { seasonId: "season-b", label: "Unknown System", stateText: "Uncharted." };
  it("says what is known and how to learn more", async () => {
    const { panel, controller, openPanel } = await setup();
    controller.showTarget(target);
    expect(openPanel).toHaveBeenCalled();
    expect(panel.querySelector("[data-duke-title]")!.textContent).toContain("Unknown System");
    expect(panel.querySelector("[data-duke-target-intel]")!.textContent).toContain("nothing about its defences");
    expect(panel.textContent).toContain("Send a Probe");
  });
  it("shows the survey once a Probe has reported", async () => {
    const { panel, controller } = await setup(dukeStatus({ intel: [{ ...surveyed, defenderHull: null }] }));
    controller.showTarget({ ...target, label: "Kel" });
    expect(panel.querySelector("[data-duke-target-intel]")!.textContent).toContain("undefended");
    expect(panel.textContent).toContain("raid it");
  });
});

describe("refresh", () => {
  it("does not rebuild the panel under a focused input", async () => {
    const { panel, controller } = await setup();
    controller.showTab("COURT");
    const wager = panel.querySelector<HTMLInputElement>("[data-duke-court-wager]")!;
    wager.focus();
    wager.value = "42";
    await controller.refresh();
    expect(panel.querySelector<HTMLInputElement>("[data-duke-court-wager]")!.value).toBe("42");
  });
  it("reflects new status after a refresh", async () => {
    const duke = await setup();
    duke.setStatus(dukeStatus({ attention: [] }));
    await duke.controller.refresh();
    expect(duke.screen.textContent).toContain("All quiet");
  });
});

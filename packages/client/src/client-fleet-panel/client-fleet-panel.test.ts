// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountFleetPanel } from "./client-fleet-panel.js";

const flushAsync = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mountFleetPanel", () => {
  it("renders blueprints, orders, and the battle log from the initial fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/fleets/blueprints")) return Promise.resolve({ ok: true, json: async () => ({ blueprints: [{ id: "bp1", name: "Strike Force", composition: { RAIDER: 2 }, weaponEmphasis: "KINETIC" }] }) });
        if (url.includes("/fleets/log")) return Promise.resolve({ ok: true, json: async () => ({ entries: [{ attackerAuthUid: "uid-1", defenderAuthUid: "uid-2", targetSeasonId: "season-1", reconOnly: false, netDamage: 50, stabilityAfter: 50, resolvedAt: 0 }] }) });
        if (url.includes("/fleets")) return Promise.resolve({ ok: true, json: async () => ({ orders: [{ id: "o1", targetSeasonId: "season-1", status: "TRAVELING", arrivesAt: 0 }] }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );
    const container = document.createElement("div");
    mountFleetPanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => [{ seasonId: "season-1", label: "Aurelia" }]
    });
    await flushAsync();

    expect(container.querySelector("[data-fleet-target-select] option")?.textContent).toBe("Aurelia");
    expect(container.textContent).toContain("Strike Force");
    expect(container.textContent).toContain("TRAVELING");
    expect(container.textContent).toContain("uid-1");
  });

  it("sending a fleet posts the composition read from the hull-count inputs", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && typeof url === "string" && url.includes("/fleets/send")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, order: { id: "o1" } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    mountFleetPanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => [{ seasonId: "season-1", label: "Aurelia" }]
    });
    await flushAsync();

    container.querySelector<HTMLInputElement>('[data-fleet-hull-count="RAIDER"]')!.value = "3";
    const form = container.querySelector("[data-fleet-send-form]") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsync();

    const sendCall = fetchMock.mock.calls.find((call: unknown[]) => typeof call[0] === "string" && call[0].includes("/fleets/send"));
    expect(sendCall).toBeDefined();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body).toEqual({ targetSeasonId: "season-1", composition: { RAIDER: 3 }, weaponEmphasis: "KINETIC" });
  });

  it("shows a friendly message on a 402 send failure instead of the raw status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve({ ok: false, status: 402 });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );
    const container = document.createElement("div");
    mountFleetPanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => [{ seasonId: "season-1", label: "Aurelia" }]
    });
    await flushAsync();

    container.querySelector<HTMLInputElement>('[data-fleet-hull-count="SCOUT"]')!.value = "1";
    const form = container.querySelector("[data-fleet-send-form]") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsync();

    const message = container.querySelector<HTMLParagraphElement>("[data-fleet-message]");
    expect(message?.hidden).toBe(false);
    expect(message?.textContent).toContain("Production");
  });

  it("deleting a blueprint calls DELETE on its id", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/fleets/blueprints") && init?.method !== "DELETE") {
        return Promise.resolve({ ok: true, json: async () => ({ blueprints: [{ id: "bp1", name: "Strike Force", composition: { RAIDER: 2 }, weaponEmphasis: "KINETIC" }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    mountFleetPanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => []
    });
    await flushAsync();

    const deleteBtn = container.querySelector<HTMLButtonElement>("[data-fleet-delete-blueprint]")!;
    deleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAsync();

    const deleteCall = fetchMock.mock.calls.find((call: unknown[]) => (call[1] as RequestInit | undefined)?.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toContain("/fleets/blueprints/bp1");
  });
});

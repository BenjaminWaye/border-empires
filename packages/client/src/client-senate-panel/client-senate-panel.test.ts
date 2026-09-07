// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSenatePanel } from "./client-senate-panel.js";

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mountSenatePanel", () => {
  it("renders proposals and target options from the initial fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ proposals: [{ id: "p1", type: "EMBARGO", status: "PENDING", targetAuthUid: "uid-1", createdAt: 0 }] })
      })
    );
    const container = document.createElement("div");
    mountSenatePanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => [{ seasonId: "season-1", label: "Aurelia" }]
    });
    await flushAsync();

    expect(container.querySelector("[data-senate-target-select] option")?.textContent).toBe("Aurelia");
    expect(container.querySelector("[data-senate-proposal-id='p1']")).not.toBeNull();
    expect(container.querySelector("[data-senate-vote]")).not.toBeNull();
  });

  it("shows a friendly message on a 402 propose failure instead of the raw status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve({ ok: false, status: 402 });
        return Promise.resolve({ ok: true, json: async () => ({ proposals: [] }) });
      })
    );
    const container = document.createElement("div");
    mountSenatePanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => [{ seasonId: "season-1", label: "Aurelia" }]
    });
    await flushAsync();

    const form = container.querySelector("[data-senate-propose-form]") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushAsync();

    const message = container.querySelector<HTMLParagraphElement>("[data-senate-message]");
    expect(message?.hidden).toBe(false);
    expect(message?.textContent).toContain("Influence");
  });

  it("casting a vote calls the vote endpoint with the clicked proposal's id", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/senate/vote")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, weight: 11 }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ proposals: [{ id: "p1", type: "EMBARGO", status: "PENDING", targetAuthUid: "uid-1", createdAt: 0 }] })
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    mountSenatePanel(container, {
      wsUrl: "wss://example.test",
      getIdToken: async () => "token",
      getTargetOptions: () => []
    });
    await flushAsync();

    const voteBtn = container.querySelector<HTMLButtonElement>("[data-senate-vote]")!;
    voteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAsync();

    const voteCall = fetchMock.mock.calls.find((call: unknown[]) => typeof call[0] === "string" && call[0].includes("/senate/vote"));
    expect(voteCall).toBeDefined();
    expect(JSON.parse((voteCall![1] as RequestInit).body as string)).toEqual({ proposalId: "p1" });
  });

  it("renders a quorum progress bar when the listing carries live vote-tally data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          proposals: [
            { id: "p1", type: "CONTEST", status: "PENDING", targetAuthUid: "uid-1", createdAt: 0, castWeight: 20, totalWeight: 50, quorumPct: 0.4, distinctVoters: 2, minDistinctVoters: 3, resolvesAt: Date.now() + 3_600_000 }
          ]
        })
      })
    );
    const container = document.createElement("div");
    mountSenatePanel(container, { wsUrl: "wss://example.test", getIdToken: async () => "token", getTargetOptions: () => [] });
    await flushAsync();

    expect(container.querySelector(".sn-quorum-fill")).not.toBeNull();
    expect(container.textContent).toContain("2/3 voters");
  });

  it("selecting a different action card updates which one shows as selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposals: [] }) }));
    const container = document.createElement("div");
    mountSenatePanel(container, { wsUrl: "wss://example.test", getIdToken: async () => "token", getTargetOptions: () => [] });
    await flushAsync();

    const contestRadio = container.querySelector<HTMLInputElement>('[data-senate-type-radio][value="CONTEST"]')!;
    contestRadio.checked = true;
    contestRadio.dispatchEvent(new Event("change", { bubbles: true }));

    const selectedCards = container.querySelectorAll(".sn-action-card-selected");
    expect(selectedCards).toHaveLength(1);
    expect(selectedCards[0]?.textContent).toContain("CONTEST");
  });
});

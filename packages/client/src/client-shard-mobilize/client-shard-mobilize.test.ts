// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { renderManpowerPanelHtml } from "../client-side-panel-html/client-side-panel-html.js";
import { applyShardMobilizedMessage, bindShardMobilizeButtons, shardMobilizeCardHtml } from "./client-shard-mobilize.js";

const ready = { shards: 2, manpower: 100, manpowerCap: 900, manpowerRegenPerMinute: 3 };

const mount = (html: string): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("shardMobilizeCardHtml", () => {
  it("offers the refill with the manpower it would add when a Shard is held", () => {
    const button = mount(shardMobilizeCardHtml(ready)).querySelector<HTMLButtonElement>("[data-shard-mobilize]");
    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toContain("+800");
  });

  it.each([
    ["no Shard", { ...ready, shards: 0 }, "no Shards"],
    ["full manpower", { ...ready, manpower: 900 }, "already full"],
    ["a Titanium Levy freeze", { ...ready, manpowerRegenPerMinute: 0 }, "Titanium Levy"]
  ])("disables the button with a reason for %s", (_label, input, reason) => {
    const root = mount(shardMobilizeCardHtml(input));
    expect(root.querySelector<HTMLButtonElement>("[data-shard-mobilize]")?.disabled).toBe(true);
    expect(root.textContent).toContain(reason);
  });
});

describe("bindShardMobilizeButtons", () => {
  it("sends SHARD_MOBILIZE when an enabled button is clicked", () => {
    const root = mount(shardMobilizeCardHtml(ready));
    const sendGameMessage = vi.fn(() => true);
    bindShardMobilizeButtons(root, sendGameMessage);
    root.querySelector<HTMLButtonElement>("[data-shard-mobilize]")?.click();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SHARD_MOBILIZE" }, expect.any(String));
  });
});

describe("manpower panel", () => {
  const panelArgs = {
    manpower: 100,
    manpowerCap: 900,
    manpowerRegenPerMinute: 3,
    manpowerBreakdown: { cap: [], regen: [] },
    musterFlags: [],
    formatManpowerAmount: (value: number) => String(Math.floor(value)),
    rateToneClass: () => ""
  };

  it("includes the Shard Mobilization card when the Shard count is passed", () => {
    expect(renderManpowerPanelHtml({ ...panelArgs, shards: 1 })).toContain("data-shard-mobilize");
  });

  it("omits it for callers that pass no Shard count", () => {
    expect(renderManpowerPanelHtml(panelArgs)).not.toContain("data-shard-mobilize");
  });
});

describe("applyShardMobilizedMessage", () => {
  it("announces the Court's delivery in the feed and the shard card", () => {
    const state = { feed: [] as { text?: string; severity?: string }[] };
    applyShardMobilizedMessage(state as never, { type: "SHARD_MOBILIZED", delivered: 768 });
    expect(state.feed[0]).toMatchObject({ severity: "success" });
    expect(state.feed[0]?.text).toContain("delivery of 768 ancillaries");
    expect(document.getElementById("shard-collect-overlay")?.textContent).toContain("The Court looks favourably on your donation");
    document.getElementById("shard-collect-overlay")?.remove();
  });
});

// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { renderManpowerPanelHtml } from "../client-side-panel-html/client-side-panel-html.js";
import { bindShardMobilizeButtons, shardMobilizeCardHtml } from "./client-shard-mobilize.js";

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

  it("renders nothing without a Shard to donate", () => {
    expect(shardMobilizeCardHtml({ ...ready, shards: 0 })).toBe("");
    expect(shardMobilizeCardHtml({ ...ready, shards: 0.5 })).toBe("");
  });

  it.each([
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

  it("includes the Imperial delivery card when the Shard count is passed", () => {
    expect(renderManpowerPanelHtml({ ...panelArgs, shards: 1 })).toContain("data-shard-mobilize");
  });

  it("omits it for callers that pass no Shard count, and when the player holds none", () => {
    expect(renderManpowerPanelHtml(panelArgs)).not.toContain("data-shard-mobilize");
    expect(renderManpowerPanelHtml({ ...panelArgs, shards: 0 })).not.toContain("data-shard-mobilize");
  });
});

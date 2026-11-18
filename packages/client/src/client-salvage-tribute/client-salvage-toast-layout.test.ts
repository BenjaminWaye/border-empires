import { describe, expect, it } from "vitest";
import { groupSalvageToasts, salvageToastLabel, salvageToastModeFor, salvageToastText } from "./client-salvage-toast-layout.js";
import type { SalvageToast } from "./client-salvage-ready-toasts.js";

const toast = (x: number, y: number, loads = 3, ready = false): SalvageToast => ({ key: `${x},${y}`, x, y, loads, ready });

describe("salvage toast layout", () => {
  it("merges a deposit of adjacent Works into one toast instead of a stack", () => {
    // Four fields one tile apart at 20 CSS px per tile: previously four overlapping banners.
    const placed = [toast(10, 10), toast(10, 11), toast(11, 10, 1, true), toast(11, 11)].map((t, i) => ({ toast: t, x: 100 + (i >> 1) * 20, y: 200 + (i & 1) * 20 }));
    const groups = groupSalvageToasts(placed, "pip");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ loads: 10, fields: 4, ready: true, target: { x: 11, y: 10 } });
    expect(salvageToastText(groups[0]!, "pip")).toBe("10");
    expect(salvageToastLabel(groups[0]!)).toBe("4 salvage fields near 11, 10: 10 loads. Ship to the Court");
  });

  it("keeps far-apart fields separate", () => {
    const groups = groupSalvageToasts([{ toast: toast(1, 1), x: 50, y: 50 }, { toast: toast(30, 30), x: 300, y: 300 }], "label");
    expect(groups.map(g => g.key)).toEqual(["1,1", "30,30"]);
    expect(salvageToastText(groups[0]!, "label")).toBe("Salvage 3");
  });

  it("never leaves two markers close enough to overlap, whatever the tile order", () => {
    // x=0 and x=70 start apart; x=35 joining the first used to pull it within reach of the second.
    const groups = groupSalvageToasts([0, 70, 35].map((x, i) => ({ toast: toast(i, 0), x, y: 100 })), "label");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ fields: 3, loads: 9 });
  });

  it("merges labels two tiles apart, since a label is wider than that", () => {
    const groups = groupSalvageToasts([{ toast: toast(1, 1), x: 100, y: 50 }, { toast: toast(3, 1), x: 176, y: 50 }], "label");
    expect(groups).toHaveLength(1);
  });

  it("shrinks to a pip when zoomed out", () => {
    expect(salvageToastModeFor(16)).toBe("pip");
    expect(salvageToastModeFor(48)).toBe("label");
  });
});

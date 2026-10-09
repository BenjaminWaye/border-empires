import { describe, expect, it } from "vitest";
import { devGearsChipHtml, MAX_DEV_GEARS } from "./client-dev-gears.js";

const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe("devGearsChipHtml", () => {
  it("renders one gear per slot, lighting and spinning only the busy ones", () => {
    const html = devGearsChipHtml({ busy: 2, limit: 3, mobile: false });
    expect(count(html, '<svg class="dev-gear')).toBe(3);
    expect(count(html, "is-busy")).toBe(2);
    expect(html).toContain('data-panel="development"');
    expect(html).toContain('aria-label="Development: 2 of 3 slots busy"');
  });

  it("counter-rotates alternate gears so the teeth look meshed", () => {
    const html = devGearsChipHtml({ busy: 4, limit: 4, mobile: false });
    expect(count(html, "is-ccw")).toBe(2);
  });

  it("marks a full train and sizes the train to its gears", () => {
    const full = devGearsChipHtml({ busy: 3, limit: 3, mobile: false });
    expect(full).toContain("dev-gears is-full");
    expect(full).toContain("width:56px"); // 3 gears x 20px, minus 2 overlaps of 3px, plus 2px
    expect(devGearsChipHtml({ busy: 0, limit: 3, mobile: false })).not.toContain("is-full");
    expect(devGearsChipHtml({ busy: 1, limit: 3, mobile: true })).toContain("width:43px"); // 3 gears x 15px, minus 2 overlaps of 2px, plus 2px
  });

  it("falls back to busy/limit text when there are too many slots for a train", () => {
    const html = devGearsChipHtml({ busy: 5, limit: MAX_DEV_GEARS + 1, mobile: false });
    expect(html).not.toContain("dev-gear-train");
    expect(html).toContain(`<strong>5/${MAX_DEV_GEARS + 1}</strong>`);
    expect(devGearsChipHtml({ busy: 0, limit: 0, mobile: true })).toContain("<strong>0/0</strong>");
  });
});

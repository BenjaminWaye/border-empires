import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../client-auth-busy-viewport-style.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("loading modal viewport layout", () => {
  it("includes the loading card padding and border in its available width", () => {
    expect(rule(".auth-busy-card")).toContain("box-sizing: border-box");
    expect(rule(".auth-busy-card")).toContain("min-width: 0");
    expect(rule(".auth-busy-card")).toContain("overflow-wrap: anywhere");
  });

  it("allows the centered grid track to shrink below the message's intrinsic width", () => {
    expect(rule('#auth-overlay[data-busy="true"] #auth-busy-modal'))
      .toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("keeps tall loading content reachable on short screens", () => {
    const modal = rule('#auth-overlay[data-busy="true"] #auth-busy-modal');
    expect(modal).toContain("overflow-y: auto");
    expect(modal).toContain("place-items: safe center");
  });
});

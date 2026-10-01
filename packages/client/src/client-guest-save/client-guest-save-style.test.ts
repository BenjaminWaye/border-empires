import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../client-guest-save-style.css", import.meta.url), "utf8");

const ruleBody = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};

describe("guest save badge styling", () => {
  it("is centred without a transform so .panel-btn:active cannot shift it left", () => {
    const body = ruleBody(".guest-save-badge");
    expect(body).not.toMatch(/transform\s*:/);
    expect(body).toMatch(/margin-inline:\s*auto/);
  });
});

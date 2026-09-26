import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styleSource = readFileSync(new URL("./client-activity-dashboard-style.css", import.meta.url), "utf8");

describe("Activity dashboard mobile layout", () => {
  it("keeps the padded modal and its card text within a narrow viewport", () => {
    expect(styleSource).toMatch(/\.activity-dashboard-modal\s*\{[\s\S]*?box-sizing: border-box;[\s\S]*?width: min\(780px, 100%\);/);
    expect(styleSource).toMatch(/\.activity-dashboard-card-text\s*\{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/);
    expect(styleSource).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.activity-dashboard-modal\s*\{[\s\S]*?width: 100%;/);
  });
});

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const sourceFor = (name: string): string => readFileSync(resolve(here, name), "utf8");

describe("shard rain alert regression guard", () => {
  it("renders a dedicated shard alert and clears shard fx on dismiss", () => {
    const mainSource = sourceFor("./main.ts");
    expect(mainSource).toContain("const renderShardAlert = (): void => {");
    expect(mainSource).toContain("state.shardRainFxUntil = 0;");
    expect(mainSource).toContain("shardAlertCloseBtn.onclick = () => {");
  });

  it("stops using feed messages as the primary shard rain alert path", () => {
    const mainSource = sourceFor("./main.ts");
    expect(mainSource).not.toContain("Shard rain sighted at");
    expect(mainSource).not.toContain("Shard rain has begun. ${siteCount}");
  });
});

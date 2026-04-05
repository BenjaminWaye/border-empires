import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client bootstrap regression", () => {
  it("renders the HUD immediately during bootstrap", () => {
    const source = readFileSync(new URL("./client-bootstrap.ts", import.meta.url), "utf8");
    const bindMapInputAt = source.lastIndexOf("bindClientMapInput(state, {");
    const finalRenderAt = source.lastIndexOf("renderHud();");

    expect(bindMapInputAt).toBeGreaterThan(-1);
    expect(finalRenderAt).toBeGreaterThan(bindMapInputAt);
  });
});

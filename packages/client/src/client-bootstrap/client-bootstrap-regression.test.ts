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

  it("wires applyOptimisticStructureRemoval into createClientActionFlow (structure-removal crash fix)", () => {
    const source = readFileSync(new URL("./client-bootstrap.ts", import.meta.url), "utf8");
    const actionFlowCallStart = source.lastIndexOf("createClientActionFlow({");
    const actionFlowCall = source.slice(actionFlowCallStart, actionFlowCallStart + 6000);

    expect(actionFlowCall).toContain("applyOptimisticStructureRemoval");
    expect(source.match(/applyOptimisticStructureRemoval/g)).toHaveLength(2);
  });
});

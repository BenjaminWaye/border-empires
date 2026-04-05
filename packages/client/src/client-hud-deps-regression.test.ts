import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD dependency wiring", () => {
  it("passes renderMobilePanels into renderClientHud", () => {
    const source = readFileSync(new URL("./client-bootstrap.ts", import.meta.url), "utf8");
    const renderHudCallAt = source.indexOf("renderClientHud({");
    const renderMobilePanelsAt = source.indexOf("renderMobilePanels,", renderHudCallAt);

    expect(renderHudCallAt).toBeGreaterThan(-1);
    expect(renderMobilePanelsAt).toBeGreaterThan(renderHudCallAt);
  });
});

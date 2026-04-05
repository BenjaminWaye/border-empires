import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("domain panel detail layout regression guard", () => {
  it("keeps desktop domain detail open as a fixed-width cover and shifts the minimap instead of the panel", () => {
    const styleSource = sourceFor("./style.css");
    const hudSource = sourceFor("./client-hud.ts");

    expect(styleSource).toContain("#hud.desktop-side-panel-open #mini-map-wrap");
    expect(styleSource).toContain("right: 456px;");
    expect(styleSource).not.toContain("#side-panel.domain-panel-active #panel-domains-content");
    expect(hudSource).toContain("btn.onpointerup = (event: PointerEvent) => {");
  });
});

import { readFileSync } from "node:fs";
import { networkIconExports } from "./network-icon-svg.js";
import { expect, it } from "vitest";

it("ships 2D overlays exported from the current production models", () => {
  for (const { filename, svg } of networkIconExports())
    expect(readFileSync(new URL(`../../public/overlays/${filename}`, import.meta.url), "utf8"), filename).toBe(svg);
});

it("keeps the Reclamation Works crane and yard inside its 2D icon", () => {
  const icon = networkIconExports().find(row => row.filename === "reclamation-works-overlay.svg")!;
  const paths = [...icon.svg.matchAll(/ d="([^"]+)"/g)];
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) for (const coordinate of path[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []) {
    expect(Number(coordinate)).toBeGreaterThanOrEqual(0);
    expect(Number(coordinate)).toBeLessThanOrEqual(128);
  }
});

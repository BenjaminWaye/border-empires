import { describe, expect, it } from "vitest";
import { tileMenuRenderSignature } from "./client-tile-menu-render-signature.js";
import type { TileMenuView } from "./client-types.js";

const baseView = (): TileMenuView => ({
  title: "Grass (1, 1)",
  subtitle: "Your settled land",
  tabs: ["buildings", "overview"],
  overviewLines: [{ html: "Settled land" }],
  actions: [],
  buildings: [{ id: "build_observatory", label: "Build Observatory", cost: "800 gold • 45 CRYSTAL • 10m" }],
  crystal: []
});

describe("tile menu render signature", () => {
  it("stays stable for unchanged menu content", () => {
    const signatureA = tileMenuRenderSignature(baseView(), "buildings");
    const signatureB = tileMenuRenderSignature(baseView(), "buildings");
    expect(signatureA).toBe(signatureB);
  });

  it("changes when visible content for the active tab changes", () => {
    const signatureA = tileMenuRenderSignature(baseView(), "buildings");
    const signatureB = tileMenuRenderSignature(
      {
        ...baseView(),
        buildings: [{ id: "build_foundry", label: "Build Foundry", cost: "4500 gold • 5m • doubles mines within 10 tiles" }]
      },
      "buildings"
    );
    expect(signatureA).not.toBe(signatureB);
  });

  it("ignores hidden-tab changes so the buildings tab can keep its scroll position", () => {
    const signatureA = tileMenuRenderSignature(baseView(), "buildings");
    const signatureB = tileMenuRenderSignature(
      {
        ...baseView(),
        overviewLines: [{ html: "Overview changed elsewhere" }]
      },
      "buildings"
    );
    expect(signatureA).toBe(signatureB);
  });
});

import { Scene, Sprite, SpriteMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFloatingTextLayer } from "./client-map-3d-floating-text.js";

const stubCanvasDocument = (): void => {
  const ctx = {
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetY: 0,
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: ""
  };

  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx)
    }))
  });
};

describe("createFloatingTextLayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps negative population text readable, then removes it after the fade", () => {
    stubCanvasDocument();
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const scene = new Scene();
    const layer = createFloatingTextLayer(scene);

    layer.spawn(4, 5, 1, "-657 pop");

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).toBeInstanceOf(Sprite);

    layer.update(2_600);
    const visibleSprite = scene.children[0] as Sprite;
    const visibleMaterial = visibleSprite.material as SpriteMaterial;
    expect(visibleMaterial.opacity).toBe(1);
    expect(visibleSprite.position.y).toBeGreaterThan(3.2);

    layer.update(5_500);

    expect(scene.children).toHaveLength(0);
  });
});

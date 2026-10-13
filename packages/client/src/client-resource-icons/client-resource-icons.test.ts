import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  depositIconKey,
  drawResourceIconOnCanvas,
  resourceIconGlyph,
  resourceIconHtml,
  resourceIconUrl,
  resourceSimpleIconUrl,
  type ResourceIconKey,
  type ResourceIconPx
} from "./client-resource-icons.js";

const KEYS: ResourceIconKey[] = ["GOLD", "FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"];
const SIZES: ResourceIconPx[] = [96, 256];

const fakeCtx = () => {
  const ctx = { drawImage: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn(), font: "", textAlign: "", textBaseline: "" };
  return { ctx, asCanvas: ctx as unknown as CanvasRenderingContext2D };
};

describe("resource icon assets", () => {
  it("ships every file the code references for every resource", () => {
    for (const key of KEYS) {
      const simple = fileURLToPath(new URL(`../../public${resourceSimpleIconUrl(key)}`, import.meta.url));
      expect(existsSync(simple), simple).toBe(true);
      for (const px of SIZES) {
        const file = fileURLToPath(new URL(`../../public${resourceIconUrl(key, px)}`, import.meta.url));
        expect(existsSync(file), file).toBe(true);
      }
    }
  });
});

describe("resourceIconHtml", () => {
  it("renders the simple small-size SVG inline with a readable alt", () => {
    expect(resourceIconHtml("CRYSTAL")).toBe(
      '<img class="resource-icon-img" src="/icons/simple/crystal.svg" alt="Crystal" draggable="false" decoding="async">'
    );
  });

  it("uses the detailed painted 96/256 exports for large art slots", () => {
    const html = resourceIconHtml("SHARD", "large");
    expect(html).toContain('src="/icons/resources/shard-96.png"');
    expect(html).toContain("/icons/resources/shard-256.png 2x");
  });

  it("falls back to the text glyph for keys without an icon", () => {
    expect(resourceIconHtml("MANPOWER")).toBe("•");
  });
});

describe("resourceIconGlyph", () => {
  it("keeps the plain-text glyphs for canvas and title contexts", () => {
    expect(KEYS.map(resourceIconGlyph)).toEqual(["◉", "🍞", "⛏", "💎", "🟣", "✦"]);
    expect(resourceIconGlyph("FARM")).toBe("•");
  });
});

describe("depositIconKey", () => {
  it("maps tile deposit kinds onto the resource they feed", () => {
    expect(depositIconKey("FARM")).toBe("FOOD");
    expect(depositIconKey("FISH")).toBe("FOOD");
    expect(depositIconKey("GEMS")).toBe("CRYSTAL");
    expect(depositIconKey("TITANIUM")).toBe("TITANIUM");
    expect(depositIconKey("UMBRITE")).toBe("UMBRITE");
    expect(depositIconKey("WOOD")).toBeUndefined();
    expect(depositIconKey(undefined)).toBeUndefined();
  });
});

describe("drawResourceIconOnCanvas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws the text glyph when no decoded image is available", () => {
    const { ctx, asCanvas } = fakeCtx();
    drawResourceIconOnCanvas(asCanvas, "FOOD", 10, 10, 20, "16px system-ui");
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith("🍞", 10, expect.any(Number));
    expect(ctx.font).toBe("16px system-ui");
  });

  it("draws the PNG centred in its box once it has decoded", () => {
    class DecodedImage {
      complete = true;
      naturalWidth = 96;
      decoding = "";
      src = "";
    }
    vi.stubGlobal("Image", DecodedImage);
    const { ctx, asCanvas } = fakeCtx();
    drawResourceIconOnCanvas(asCanvas, "UMBRITE", 50, 40, 20);
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.objectContaining({ src: "/icons/simple/umbrite.svg" }), 40, 30, 20, 20);
  });
});

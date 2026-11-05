import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

// Small deterministic textures for the art study: bark grain and forest litter.
// They are generated locally, never loaded into the live client.
export const createForestSurfaces = (): { bark: Texture; ground: Texture; dispose: () => void } => {
  const canvas = (size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const result = document.createElement("canvas");
    result.width = size;
    result.height = size;
    const ctx = result.getContext("2d");
    if (!ctx) throw new Error("Forest material canvas unavailable");
    return { canvas: result, ctx };
  };
  let seed = 71239;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const barkCanvas = canvas(256);
  barkCanvas.ctx.fillStyle = "#c0a68a";
  barkCanvas.ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 440; i += 1) {
    const x = rand() * 256;
    const y = rand() * 256;
    barkCanvas.ctx.strokeStyle = i % 3 === 0 ? "rgba(43,29,21,.45)" : "rgba(244,219,178,.22)";
    barkCanvas.ctx.lineWidth = 0.5 + rand() * 2.1;
    barkCanvas.ctx.beginPath();
    barkCanvas.ctx.moveTo(x, y);
    barkCanvas.ctx.bezierCurveTo(x - 4, y + 12, x + 5, y + 25, x + rand() * 5 - 2, y + 15 + rand() * 75);
    barkCanvas.ctx.stroke();
  }
  const floor = canvas(512);
  floor.ctx.fillStyle = "#788057";
  floor.ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 110; i += 1) {
    const x = rand() * 512;
    const y = rand() * 512;
    const radius = 15 + rand() * 65;
    const patch = floor.ctx.createRadialGradient(x, y, 0, x, y, radius);
    patch.addColorStop(0, i % 3 === 0 ? "rgba(53,39,25,.28)" : "rgba(118,144,61,.27)");
    patch.addColorStop(1, "rgba(53,39,25,0)");
    floor.ctx.fillStyle = patch;
    floor.ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 220; i += 1) {
    floor.ctx.save();
    floor.ctx.translate(rand() * 512, rand() * 512);
    floor.ctx.rotate(rand() * Math.PI * 2);
    floor.ctx.fillStyle = ["#615333", "#9c8552", "#5f703d", "#ada070"][i % 4]!;
    floor.ctx.globalAlpha = 0.45;
    floor.ctx.beginPath();
    floor.ctx.ellipse(0, 0, 1 + rand() * 1.4, 2 + rand() * 3, 0, 0, Math.PI * 2);
    floor.ctx.fill();
    floor.ctx.restore();
  }
  const bark = new CanvasTexture(barkCanvas.canvas);
  bark.colorSpace = SRGBColorSpace;
  bark.wrapS = bark.wrapT = RepeatWrapping;
  bark.repeat.set(2, 1);
  const ground = new CanvasTexture(floor.canvas);
  ground.colorSpace = SRGBColorSpace;
  return { bark, ground, dispose: () => { bark.dispose(); ground.dispose(); } };
};

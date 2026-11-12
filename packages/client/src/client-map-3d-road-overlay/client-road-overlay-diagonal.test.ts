import { describe, expect, it } from "vitest";

type LoggedCommand =
  | { type: "moveTo" | "lineTo"; x: number; y: number }
  | { type: "stroke" };

const createMockContext = (commands: LoggedCommand[]): CanvasRenderingContext2D =>
  ({
    save() {},
    restore() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      commands.push({ type: "moveTo", x, y });
    },
    lineTo(x: number, y: number) {
      commands.push({ type: "lineTo", x, y });
    },
    stroke() {
      commands.push({ type: "stroke" });
    },
    arc() {},
    fill() {},
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0
  }) as unknown as CanvasRenderingContext2D;

describe("drawRoadOverlay", () => {
  it("draws southeast links center-to-center across diagonal neighbors", async () => {
    const commands: LoggedCommand[] = [];
    const ctx = createMockContext(commands);
    globalThis.Image = class {
      complete = true;
      naturalWidth = 1;
      decoding = "async";
      src = "";
    } as typeof Image;
    const { drawRoadOverlay } = await import("../client-map-render/client-map-render.js");

    drawRoadOverlay(ctx, { southeast: true }, 10, 20, 16);

    // The monorail draws twin beams either side of the link, so pair up the
    // strokes and check that two of them straddle the centre-to-centre line.
    const strokes: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
    for (let i = 0; i + 1 < commands.length; i += 1) {
      const a = commands[i]!, b = commands[i + 1]!;
      if (a.type === "moveTo" && b.type === "lineTo") strokes.push({ from: a, to: b });
    }
    const near = (v: number, target: number): boolean => Math.abs(v - target) < 1e-6;
    const straddles = strokes.some((s1) => strokes.some((s2) => s1 !== s2 &&
      near((s1.from.x + s2.from.x) / 2, 18) && near((s1.from.y + s2.from.y) / 2, 28) &&
      near((s1.to.x + s2.to.x) / 2, 34) && near((s1.to.y + s2.to.y) / 2, 44)));
    expect(straddles).toBe(true);
  });
});

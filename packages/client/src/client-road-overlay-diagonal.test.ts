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
    const { drawRoadOverlay } = await import("./client-map-render.js");

    drawRoadOverlay(ctx, { southeast: true }, 10, 20, 16);

    expect(commands).toContainEqual({ type: "moveTo", x: 18, y: 28 });
    expect(commands).toContainEqual({ type: "lineTo", x: 34, y: 44 });
  });
});

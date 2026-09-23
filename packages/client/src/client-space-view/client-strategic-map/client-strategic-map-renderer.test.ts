import { describe, expect, it } from "vitest";
import type { SpacePlanetViewModel } from "../client-space-view-state.js";
import { buildStrategicMapModel } from "./client-strategic-map-controller.js";
import { drawStrategicMap } from "./client-strategic-map-renderer.js";

// A recording stand-in for CanvasRenderingContext2D: every property write is
// ignored, every method call is recorded.
const recordingContext = (): { ctx: CanvasRenderingContext2D; calls: string[]; texts: string[] } => {
  const calls: string[] = [];
  const texts: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      if (prop === "createRadialGradient") return () => gradient;
      if (prop === "measureText") return () => ({ width: 40 });
      return (...args: unknown[]) => {
        calls.push(prop);
        if (prop === "fillText") texts.push(String(args[0]));
      };
    },
    set: (target, prop: string, value: unknown) => {
      target[prop] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, texts };
};

const planet = (seasonId: string, extra: Partial<SpacePlanetViewModel> = {}): SpacePlanetViewModel => ({
  seasonId,
  tier: "PLANET",
  label: seasonId,
  state: "other",
  ...extra
});

describe("drawStrategicMap", () => {
  it("draws the Core landmark even for an empty galaxy", () => {
    const { ctx, texts } = recordingContext();
    drawStrategicMap(ctx, buildStrategicMapModel([]), 800, 600, 0);
    expect(texts).toContain("THE COURT");
  });
  it("labels only notable systems", () => {
    const { ctx, texts } = recordingContext();
    const model = buildStrategicMapModel([
      planet("plain-1"),
      planet("plain-2"),
      planet("mine", { state: "owned", label: "Aria's World", ownerKey: "me" }),
      planet("hot", { state: "contested", label: "Contested" })
    ]);
    drawStrategicMap(ctx, model, 800, 600, 0);
    expect(texts).toContain("Aria's World");
    expect(texts).toContain("Contested");
    expect(texts).not.toContain("plain-1");
  });
  it("draws 300 systems without throwing", () => {
    const { ctx } = recordingContext();
    const model = buildStrategicMapModel(Array.from({ length: 300 }, (_, i) => planet(`s-${i}`)));
    expect(() => drawStrategicMap(ctx, model, 1200, 800, 1000)).not.toThrow();
  });
});

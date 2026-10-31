import { describe, expect, it } from "vitest";
import type { SpacePlanetViewModel } from "../client-space-view-state.js";
import { buildStrategicMapModel } from "./client-strategic-map-controller.js";
import { drawStrategicMap, raidProgress } from "./client-strategic-map-renderer.js";

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
  it("marks only the systems a Probe is orbiting", () => {
    const models = [planet("a"), planet("b"), planet("c")];
    const none = recordingContext();
    drawStrategicMap(none.ctx, buildStrategicMapModel(models), 800, 600, 0);
    expect(none.calls.filter((c) => c === "ellipse")).toHaveLength(0);
    const some = recordingContext();
    drawStrategicMap(some.ctx, buildStrategicMapModel(models, new Set(["a", "c"])), 800, 600, 0);
    expect(some.calls.filter((c) => c === "ellipse")).toHaveLength(2);
  });
  it("draws 300 systems without throwing", () => {
    const { ctx } = recordingContext();
    const model = buildStrategicMapModel(Array.from({ length: 300 }, (_, i) => planet(`s-${i}`)));
    expect(() => drawStrategicMap(ctx, model, 1200, 800, 1000)).not.toThrow();
  });
});

describe("raids on the strategic map (§29.4)", () => {
  const raid = { fromSeasonId: "a", seasonId: "b", launchedAt: 1_000, arrivesAt: 3_000 };

  it("places the raider by how far along its course it is", () => {
    expect(raidProgress(raid, 0)).toBe(0);
    expect(raidProgress(raid, 2_000)).toBe(0.5);
    expect(raidProgress(raid, 9_000)).toBe(1);
  });

  it("draws a course and the raider only for raids between systems on the map", () => {
    const count = (raids: (typeof raid)[]): number => {
      const { ctx, calls } = recordingContext();
      const model = { ...buildStrategicMapModel([planet("a"), planet("b")]), raids };
      drawStrategicMap(ctx, model, 400, 400, 2_000);
      return calls.filter((c) => c === "lineTo").length;
    };
    const none = count([]);
    expect(count([raid])).toBe(none + 1);
    expect(count([{ ...raid, seasonId: "elsewhere" }])).toBe(none);
  });
});

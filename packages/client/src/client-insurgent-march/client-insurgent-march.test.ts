import { afterEach, describe, expect, it, vi } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import {
  activeInsurgentMarches,
  clearInsurgentMarches,
  insurgentMarchPose,
  insurgentMarchToTileUnderWay,
  recordInsurgentMarch
} from "./client-insurgent-march.js";
import { drawInsurgentMarches2D } from "./client-insurgent-march-2d.js";

// Insurgent attacks and expansions march out of their camp (server:
// planetary-defense-camps/camp-march.ts); INSURGENT_MARCH tells the client so
// both renderers can show the soldiers walking.
const message = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "INSURGENT_MARCH",
  commandId: "barb-1",
  actionType: "ATTACK",
  campX: 70, campY: 70, fromX: 73, fromY: 70, toX: 74, toY: 70,
  marchMs: 6_000, transitEndsAt: 16_000, resolvesAt: 31_000,
  legs: [{ kind: "WALK", points: [[70, 70], [71, 70], [72, 70], [73, 70]] }],
  legMs: [6_000],
  ...overrides
});

afterEach(() => {
  clearInsurgentMarches();
});

describe("insurgent marches", () => {
  it("walks the company from the camp to the launch tile over the march time", () => {
    const march = recordInsurgentMarch(message(), 10_000)!;
    expect(march.startAt).toBe(10_000);
    expect(insurgentMarchPose(march, 10_000)).toMatchObject({ kind: "WALK", x: 70, y: 70, progress: 0 });
    expect(insurgentMarchPose(march, 13_000)).toMatchObject({ kind: "WALK", x: 71.5, y: 70 });
    expect(insurgentMarchPose(march, 16_000)).toBeUndefined();
  });

  // REGRESSION: the client drew a straight line from camp to launch tile while
  // the server timed a route round water and hostile land, so the drawn company
  // could cross the sea and arrive somewhere it never walked.
  it("follows the route the server timed, not the straight line", () => {
    // Round water at (71,70): camp (70,70) -> (71,71) -> launch (72,70).
    const march = recordInsurgentMarch(message({
      fromX: 72, toX: 73, marchMs: 4_000, transitEndsAt: 14_000,
      legs: [{ kind: "WALK", points: [[70, 70], [71, 71], [72, 70]] }], legMs: [4_000]
    }), 10_000)!;
    expect(insurgentMarchPose(march, 12_000)).toMatchObject({ kind: "WALK", x: 71, y: 71 });
    const halfway = insurgentMarchPose(march, 11_000)!;
    expect(halfway).toMatchObject({ kind: "WALK", x: 70.5, y: 70.5 });
  });

  it("is aboard the transport for a dock crossing, then walks on from the landing", () => {
    const march = recordInsurgentMarch(message({
      campX: 10, campY: 10, fromX: 20, fromY: 10, toX: 21, toY: 10, marchMs: 10_000, transitEndsAt: 20_000,
      legs: [
        { kind: "WALK", points: [[10, 10], [11, 10]] },
        { kind: "SAIL", from: [11, 10], to: [19, 10] },
        { kind: "WALK", points: [[19, 10], [20, 10]] }
      ],
      legMs: [2_000, 6_000, 2_000]
    }), 10_000)!;
    expect(insurgentMarchPose(march, 11_000)).toMatchObject({ kind: "WALK", x: 10.5 });
    expect(insurgentMarchPose(march, 15_000)).toMatchObject({ kind: "SAIL", from: { x: 11, y: 10 }, to: { x: 19, y: 10 } });
    expect(insurgentMarchPose(march, 19_000)).toMatchObject({ kind: "WALK", x: 19.5 });
  });

  it("walks the straight line when the message carries no usable route", () => {
    const march = recordInsurgentMarch(message({ legs: [{ kind: "WALK", points: [["x", 1]] }] }), 10_000)!;
    expect(march.route.legs).toEqual([{ kind: "WALK", points: [{ x: 70, y: 70 }, { x: 71, y: 70 }, { x: 72, y: 70 }, { x: 73, y: 70 }] }]);
  });

  it("takes the short way over the world seam", () => {
    const march = recordInsurgentMarch(message({ campX: WORLD_WIDTH - 1, fromX: 1, toX: 2, legs: [{ kind: "WALK", points: [[WORLD_WIDTH - 1, 70], [0, 70], [1, 70]] }] }), 10_000)!;
    const point = insurgentMarchPose(march, 13_000)!;
    expect(point.kind === "WALK" ? point.x : NaN).toBeCloseTo(WORLD_WIDTH - 1 + 1, 5);
    expect(point.kind === "WALK" && point.facingLeft).toBe(false);
  });

  it("drops a march once it arrives, and ignores one already over or malformed", () => {
    recordInsurgentMarch(message(), 10_000);
    expect(recordInsurgentMarch(message({ commandId: "late", transitEndsAt: 9_000 }), 10_000)).toBeUndefined();
    expect(recordInsurgentMarch(message({ commandId: "bad", campX: "x" }), 10_000)).toBeUndefined();
    expect(activeInsurgentMarches(12_000)).toHaveLength(1);
    expect(activeInsurgentMarches(16_000)).toHaveLength(0);
  });

  it("holds the defender's skirmish only while the company is on the road", () => {
    recordInsurgentMarch(message(), 10_000);
    expect(insurgentMarchToTileUnderWay(74, 70, 12_000)).toBe(true);
    expect(insurgentMarchToTileUnderWay(75, 70, 12_000)).toBe(false);
    expect(insurgentMarchToTileUnderWay(74, 70, 16_000)).toBe(false);
  });

  it("draws the marching soldiers on the 2D map", () => {
    recordInsurgentMarch(message(), 10_000);
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fillRect: vi.fn(),
      fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt"
    } as unknown as CanvasRenderingContext2D;
    const worldToScreen = vi.fn((x: number, y: number, size: number) => ({ sx: x * size, sy: y * size }));
    drawInsurgentMarches2D(ctx, worldToScreen, 20, 0, 0, 13_000, false);
    // Three soldiers, each a helmet arc, near the halfway point (71.5, 70).
    expect(ctx.arc).toHaveBeenCalledTimes(3);
    const lead = vi.mocked(ctx.arc).mock.calls[0]!;
    expect(lead[0]).toBeCloseTo(71.5 * 20, 5);
    // Too small to read: nothing drawn.
    vi.mocked(ctx.arc).mockClear();
    drawInsurgentMarches2D(ctx, worldToScreen, 8, 0, 0, 13_000, false);
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import type { SpacePlanetViewModel } from "../client-space-view-state.js";
import {
  CORE_EXCLUSION_RADIUS,
  buildStarlanes,
  buildStrategicNodes,
  computeTerritoryPatches,
  fitTransform,
  pickNodeAt,
  shouldLabelSystem,
  strategicPosition
} from "./client-strategic-map-layout.js";

const model = (seasonId: string, extra: Partial<SpacePlanetViewModel> = {}): SpacePlanetViewModel => ({
  seasonId,
  tier: "PLANET",
  label: seasonId,
  state: "other",
  ...extra
});

const many = (count: number): SpacePlanetViewModel[] => Array.from({ length: count }, (_, i) => model(`season-${i}`));

describe("strategicPosition", () => {
  it("is deterministic per seasonId and stays outside the Core, inside the unit disc", () => {
    for (let i = 0; i < 300; i += 1) {
      const p = strategicPosition(`season-${i}`);
      expect(p).toEqual(strategicPosition(`season-${i}`));
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThanOrEqual(CORE_EXCLUSION_RADIUS - 1e-9);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
  it("spreads sequentially-named systems across the whole disc, not along a line or in clumps", () => {
    const points = Array.from({ length: 300 }, (_, i) => strategicPosition(`season-${i}`));
    const octants = new Array<number>(8).fill(0);
    const bands = new Array<number>(4).fill(0);
    for (const p of points) {
      const angle = (Math.atan2(p.y, p.x) + Math.PI) / (2 * Math.PI);
      octants[Math.min(7, Math.floor(angle * 8))]! += 1;
      const r = (Math.hypot(p.x, p.y) - CORE_EXCLUSION_RADIUS) / (1 - CORE_EXCLUSION_RADIUS);
      bands[Math.min(3, Math.floor(r * r * 4))]! += 1;
    }
    // A uniform spread puts ~37 in each octant and ~75 in each equal-area band.
    for (const count of octants) expect(count).toBeGreaterThan(20);
    for (const count of bands) expect(count).toBeGreaterThan(40);
    // Hash placement is random, so close pairs happen; this only catches
    // systems collapsing onto the same point.
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) closest = Math.min(closest, Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y));
    }
    expect(closest).toBeGreaterThan(0.0005);
  });
  it("does not move a system when other systems appear", () => {
    const before = buildStrategicNodes(many(5)).find((n) => n.model.seasonId === "season-3")!.point;
    const after = buildStrategicNodes(many(200)).find((n) => n.model.seasonId === "season-3")!.point;
    expect(after).toEqual(before);
  });
});

describe("buildStarlanes", () => {
  it("connects the whole galaxy and stays sparse at 300 systems", () => {
    const nodes = buildStrategicNodes(many(300));
    const lanes = buildStarlanes(nodes);
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const [a, b] of lanes) {
        const next = a === cur ? b : b === cur ? a : -1;
        if (next >= 0 && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(300);
    expect(lanes.length).toBeLessThan(300 * 3);
  });
  it("is deterministic and never links a system to itself", () => {
    const nodes = buildStrategicNodes(many(40));
    const lanes = buildStarlanes(nodes);
    expect(buildStarlanes(nodes)).toEqual(lanes);
    expect(lanes.every(([a, b]) => a !== b)).toBe(true);
  });
  it("has no Core edges: the lane list only ever references systems", () => {
    const nodes = buildStrategicNodes(many(30));
    expect(buildStarlanes(nodes).every(([a, b]) => a < nodes.length && b < nodes.length)).toBe(true);
  });
  it("handles zero and one system", () => {
    expect(buildStarlanes(buildStrategicNodes([]))).toEqual([]);
    expect(buildStarlanes(buildStrategicNodes(many(1)))).toEqual([]);
  });
});

describe("computeTerritoryPatches", () => {
  it("merges adjacent same-owner systems into one patch and leaves ownerless ones out", () => {
    const nodes = buildStrategicNodes([
      model("a", { state: "owned", ownerKey: "me" }),
      model("b", { state: "owned", ownerKey: "me" }),
      model("c", { state: "other", ownerKey: "duke:Bren" }),
      model("d")
    ]);
    const idx = (id: string) => nodes.find((n) => n.model.seasonId === id)!.index;
    const patches = computeTerritoryPatches(nodes, [[idx("a"), idx("b")], [idx("b"), idx("c")], [idx("c"), idx("d")]]);
    const mine = patches.find((p) => p.ownerKey === "me")!;
    expect(mine.nodeIndices.sort()).toEqual([idx("a"), idx("b")].sort());
    expect(patches.find((p) => p.ownerKey === "duke:Bren")!.nodeIndices).toEqual([idx("c")]);
    expect(patches).toHaveLength(2);
  });
  it("does not merge same-owner systems that aren't adjacent", () => {
    const nodes = buildStrategicNodes([model("a", { ownerKey: "me" }), model("b", { ownerKey: "me" })]);
    expect(computeTerritoryPatches(nodes, [])).toHaveLength(2);
  });
});

describe("labels, fit and picking", () => {
  it("labels only owned, contested and threatened systems", () => {
    expect(shouldLabelSystem(model("a", { state: "owned" }))).toBe(true);
    expect(shouldLabelSystem(model("a", { state: "contested" }))).toBe(true);
    expect(shouldLabelSystem(model("a", { underThreat: true }))).toBe(true);
    expect(shouldLabelSystem(model("a"))).toBe(false);
    expect(shouldLabelSystem(model("a", { state: "unknown" }))).toBe(false);
  });
  it("fits the unit disc inside the viewport and centres the Core", () => {
    const { toScreen } = fitTransform(800, 600);
    expect(toScreen({ x: 0, y: 0 })).toEqual({ x: 400, y: 300 });
    const edge = toScreen({ x: 1, y: 0 });
    expect(edge.x).toBeLessThanOrEqual(800);
  });
  it("picks the nearest system under the pointer and nothing on empty space", () => {
    const nodes = buildStrategicNodes(many(20));
    const { toScreen } = fitTransform(800, 600);
    const target = nodes[7]!;
    const p = toScreen(target.point);
    expect(pickNodeAt(nodes, toScreen, p.x + 2, p.y + 2)?.index).toBe(target.index);
    expect(pickNodeAt(nodes, toScreen, -500, -500)).toBeUndefined();
  });
});

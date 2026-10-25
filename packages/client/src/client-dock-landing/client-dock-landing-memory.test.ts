import type { DockPair } from "../client-types.js";
import { describe, expect, it } from "vitest";
import { DockLandingMemory } from "./client-dock-landing-memory.js";
import type { DockLanding } from "./client-dock-landing.js";

const landing: DockLanding = { startAt: 100, inwardX: 1, inwardZ: 0,
  route: [{ x: -1, z: 0 }, { x: -0.72, z: -0.45 }] };

describe("bounded dock landing continuity", () => {
  it("inherits only the matching origin across a result gap and expires forgotten entries", () => {
    const memory = new DockLandingMemory();
    memory.remember("5,1", "1,1", landing, 100, false);
    expect(memory.get("5,1", "2,1", 200)).toBeUndefined();
    expect(memory.remember("5,1", "1,1", { ...landing, startAt: 300 }, 300, true)).toBe(landing);
    expect(memory.get("5,1", "1,1", 2300)).toBeUndefined();
    expect(memory.metrics).toEqual({ entries: 0, expired: 1, evicted: 0 });
  });
  it("starts a fresh attack afresh and clears on a new world route set", () => {
    const memory = new DockLandingMemory(); const routes: DockPair[] = [];
    memory.syncRoutes(routes);
    memory.remember("5,1", "1,1", landing, 100, false);
    const next = { ...landing, startAt: 200 };
    expect(memory.remember("5,1", "1,1", next, 200, false)).toBe(next);
    memory.syncRoutes([]);
    expect(memory.metrics.entries).toBe(0);
  });
  it("hard caps remembered landings and counts guard evictions", () => {
    const memory = new DockLandingMemory();
    for (let i = 0; i < 70; i++) memory.remember(`${i},1`, "1,1", landing, 100, false);
    expect(memory.metrics).toEqual({ entries: 64, expired: 0, evicted: 6 });
    expect(memory.get("0,1", "1,1", 200)).toBeUndefined();
    expect(memory.get("69,1", "1,1", 200)).toBe(landing);
  });
});

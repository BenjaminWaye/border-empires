import { describe, expect, it, vi } from "vitest";
import { syncMusterTransitOverlay } from "./client-map-3d-capture-overlays.js";
import type { MusterTransit, MusterTransitOverlay } from "./client-map-3d-muster-transit-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as unknown as Heightfield;

const run = (outgoing: Record<string, unknown>, targetOwnership: string | undefined): MusterTransit[] => {
  const added: MusterTransit[] = [];
  const overlay: MusterTransitOverlay = {
    clear: () => { added.length = 0; },
    addTransit: (t) => { added.push(t); },
    commit: () => {},
    tick: () => {},
    dispose: () => {}
  };
  const state = {
    me: "me",
    capture: undefined,
    tiles: new Map(targetOwnership ? [[keyFor(5, 5), { ownershipState: targetOwnership }]] : []),
    dockPairs: [],
    musterTransitByTile: new Map(),
    deferredAttackByTile: new Map(),
    outgoingMusterAttacksByTile: new Map([[keyFor(5, 5), outgoing]])
  } as unknown as ClientState;
  syncMusterTransitOverlay(state, () => "#fff", heightfield, overlay, 0, 0, keyFor);
  return added;
};

const claiming = (now: number) => ({
  originX: 4, originY: 5, targetX: 5, targetY: 5,
  transitEndsAt: now - 1000, resolvesAt: now + 4000, musterOriginX: 1, musterOriginY: 5
});

describe("muster claim-phase stand at ease", () => {
  it("keeps the company on an expanding target until the claim resolves", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const [entry] = run({ ...claiming(now), isExpand: true }, undefined);
    expect(entry?.standUntil).toBe(now + 4000);
    expect(entry?.path.at(-1)).toEqual({ x: 5.5, z: 5.5 });
    vi.useRealTimers();
  });

  it("does the same for an attack on a known frontier tile", () => {
    const now = Date.now();
    expect(run(claiming(now), "FRONTIER")[0]?.standUntil).toBe(now + 4000);
  });

  it("adds nothing for a real fight on a defended tile (battle overlay owns it)", () => {
    expect(run(claiming(Date.now()), "SETTLED")).toHaveLength(0);
  });

  it("adds nothing once the claim has resolved", () => {
    const now = Date.now();
    expect(run({ ...claiming(now), isExpand: true, resolvesAt: now - 1 }, undefined)).toHaveLength(0);
  });
});

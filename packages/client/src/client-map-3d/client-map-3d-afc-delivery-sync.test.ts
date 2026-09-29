import { describe, expect, it, vi } from "vitest";
import { AFC_MODULE_DOCK_HEIGHT, afcSocketPlacement } from "../client-map-3d-fabrication-complex.js";
import { createFxCastOverlaySyncs, type FxCastOverlayLayers } from "./client-map-3d-fx-cast-overlays.js";
import type { ClientState } from "../client-state/client-state.js";

const setup = (queue: Array<{ x: number; y: number; slot: number; techId: string; queuedAt: number }>) => {
  const spawn = vi.fn();
  const syncs = createFxCastOverlaySyncs({
    state: { afcModuleDeliveryFxQueue: queue } as unknown as ClientState,
    sceneOrigin: { camX: 0, camY: 0 },
    aetherBridgeTileSurfaceY: () => 0,
    layers: { afcModuleDeliveryFx: { spawn } } as unknown as FxCastOverlayLayers
  });
  return { spawn, syncs, queue };
};

describe("syncAfcModuleDeliveryFxQueue", () => {
  it("lands the delivery on the socket the module docks into", () => {
    const { spawn, syncs, queue } = setup([{ x: 4, y: 7, slot: 3, techId: "masonry", queuedAt: Date.now() }]);
    syncs.syncAfcModuleDeliveryFxQueue();
    const { dx, dz } = afcSocketPlacement(3);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]![4]).toEqual({ dx, dy: AFC_MODULE_DOCK_HEIGHT, dz });
    expect(queue).toHaveLength(0);
  });

  it("drops stale deliveries queued while the 2D renderer (which never drains) was active", () => {
    const { spawn, syncs, queue } = setup([{ x: 4, y: 7, slot: 0, techId: "masonry", queuedAt: Date.now() - 60_000 }]);
    syncs.syncAfcModuleDeliveryFxQueue();
    expect(spawn).not.toHaveBeenCalled();
    expect(queue).toHaveLength(0);
  });
});

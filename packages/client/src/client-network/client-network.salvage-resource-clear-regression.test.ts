import { describe, expect, it } from "vitest";

import { bind, createState, FakeWebSocket } from "../client-network-init-message/client-network-test-harness.js";
import { createClientOptimisticStateController } from "../client-optimistic-state/client-optimistic-state.js";

// Regression: after the last salvage load the sim clears the tile's resource,
// but the gateway's full tile detail (TILE_DELTA) omitted `resource` and this
// handler only ever SET it, so the emptied field stayed on the map. The
// gateway now sends `resource: null`; it must clear through the real detail merge.
describe("TILE_DELTA clears an emptied salvage field", () => {
  const setup = () => {
    const state = createState();
    state.me = "me";
    state.tiles.set("5,287", {
      x: 5, y: 287, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "full", resource: "PRECURSOR_SALVAGE"
    });
    const keyFor = (x: number, y: number) => `${x},${y}`;
    const { mergeIncomingTileDetail } = createClientOptimisticStateController({
      state, keyFor, terrainAt: () => "LAND", tileVisibilityStateAt: () => "visible"
    });
    const ws = new FakeWebSocket();
    bind(state, ws, { mergeIncomingTileDetail });
    const send = (update: Record<string, unknown>) =>
      ws.emit("message", { data: JSON.stringify({ type: "TILE_DELTA", updates: [{ x: 5, y: 287, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "full", ...update }] }) });
    return { state, send };
  };

  it("drops the resource on an explicit null", () => {
    const { state, send } = setup();
    send({ resource: null });
    expect(state.tiles.get("5,287")?.resource).toBeUndefined();
  });

  it("keeps the resource when the update omits it or repeats it", () => {
    const { state, send } = setup();
    send({});
    expect(state.tiles.get("5,287")?.resource).toBe("PRECURSOR_SALVAGE");
    send({ resource: "PRECURSOR_SALVAGE" });
    expect(state.tiles.get("5,287")?.resource).toBe("PRECURSOR_SALVAGE");
  });
});

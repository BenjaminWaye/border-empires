import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { CommandDeltaBuffer } from "../runtime-delta-buffer.js";

// Regression: combat resolution merges every tile batch into one, and the merged batch used to drop the
// redeploy marker, so a House knocked out in combat lost its redeploy count on a restart.
describe("CommandDeltaBuffer", () => {
  it("carries redeploys from absorbed batches onto the merged batch, for both sides of one resolution", () => {
    const buffer = new CommandDeltaBuffer();
    const emitted: SimulationEvent[] = [];
    buffer.begin();
    expect(buffer.absorb({ eventType: "TILE_DELTA_BATCH", commandId: "c", playerId: "attacker", tileDeltas: [{ x: 1, y: 1 }] })).toBe(true);
    buffer.absorb({ eventType: "TILE_DELTA_BATCH", commandId: "c:respawn:defender", playerId: "defender", redeployPlayerIds: ["defender"], tileDeltas: [{ x: 2, y: 2 }] });
    buffer.absorb({ eventType: "TILE_DELTA_BATCH", commandId: "c:respawn:attacker", playerId: "attacker", redeployPlayerIds: ["attacker"], tileDeltas: [{ x: 3, y: 3 }] });
    buffer.flush("c", "attacker", (event) => void emitted.push(event));
    expect(emitted).toEqual([{ eventType: "TILE_DELTA_BATCH", commandId: "c", playerId: "attacker", redeployPlayerIds: ["defender", "attacker"], tileDeltas: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }]);
  });

  it("does not leak redeploys into the next resolution, and adds no field when there are none", () => {
    const buffer = new CommandDeltaBuffer();
    const emitted: SimulationEvent[] = [];
    buffer.begin();
    buffer.absorb({ eventType: "TILE_DELTA_BATCH", commandId: "a", playerId: "p", redeployPlayerIds: ["p"], tileDeltas: [{ x: 1, y: 1 }] });
    buffer.flush("a", "p", () => undefined);
    buffer.begin();
    buffer.absorb({ eventType: "TILE_DELTA_BATCH", commandId: "b", playerId: "q", tileDeltas: [{ x: 2, y: 2 }] });
    buffer.flush("b", "q", (event) => void emitted.push(event));
    expect(emitted).toEqual([{ eventType: "TILE_DELTA_BATCH", commandId: "b", playerId: "q", tileDeltas: [{ x: 2, y: 2 }] }]);
  });
});

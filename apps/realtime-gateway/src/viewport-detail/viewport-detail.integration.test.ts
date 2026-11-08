import { afterEach, describe, expect, it } from "vitest";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { createSimulationClient } from "../sim-client/sim-client.js";

const silentLog = { info: () => {}, error: () => {}, warn: () => {} };

describe("camera-area tile detail RPC", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => { while (cleanup.length) await cleanup.pop()?.(); });

  it("preserves single-tile detail, retrieves a camera area, and caps untrusted radii", async () => {
    const service = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => service.close());
    const { address } = await service.start();
    const client = createSimulationClient(address);
    if (!client.fetchTileDetail) throw new Error("tile detail RPC required");
    const near = await client.fetchTileDetail("player-1", 10, 10, true);
    const view = await client.fetchTileDetail("player-1", 32, 32, true, 64);
    const excessive = await client.fetchTileDetail("player-1", 32, 32, true, 1_000_000);
    expect(near.tiles.length).toBeGreaterThan(0);
    expect(near.tiles.length).toBeLessThanOrEqual(9);
    expect(view.tiles.length).toBeGreaterThan(near.tiles.length);
    expect(view.tiles.length).toBeLessThanOrEqual(129 * 129);
    expect(excessive.tiles).toEqual(view.tiles);
    // Authoritative tile detail stays the same when the camera query contains it.
    for (const tile of near.tiles) {
      expect(view.tiles.find((candidate) => candidate.x === tile.x && candidate.y === tile.y)).toEqual(tile);
    }
  }, 30_000);
});

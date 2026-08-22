import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createSimulationService } from "./simulation-service.js";
import { createRawSimulationClient, joinSeason, preparePlayer, silentLog } from "./prepare-player-test-client.js";

describe("season player cap integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("rejects a new player's JoinSeason once the season is at its player cap, but still admits a returning one via PreparePlayer", async () => {
    // The default seed profile already seeds one human ("player-1"), so a cap
    // of 2 leaves exactly one open slot for firstPlayerId below. The cap gate
    // now lives in JoinSeason (the only path that admits new players) rather
    // than PreparePlayer, since PreparePlayer no longer spawns anyone who
    // hasn't already joined.
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      maxSeasonPlayers: 2,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const firstPlayerId = "firebase-user-cap-1";
    const secondPlayerId = "firebase-user-cap-2";

    // Fills the single available slot.
    await expect(joinSeason(client, firstPlayerId)).resolves.toEqual({
      playerId: firstPlayerId,
      spawned: true,
      full: false
    });

    // A genuinely new player is turned away — never joined, never spawned.
    await expect(joinSeason(client, secondPlayerId)).resolves.toEqual({
      playerId: secondPlayerId,
      spawned: false,
      full: true
    });
    expect(service.runtime.exportState().tiles.some((tile) => tile.ownerId === secondPlayerId)).toBe(false);

    // The player who already has territory this season is never blocked by the cap.
    await expect(preparePlayer(client, firstPlayerId)).resolves.toEqual({
      playerId: firstPlayerId,
      spawned: false,
      joined: true,
      full: false
    });
  });

  it("checks the season-ended branch before the player-cap gate, so an ended season never reports SEASON_FULL", () => {
    // Regression: the cap check used to run before the `status !== "ended"`
    // guard, so a new player joining after the season ended (with the cap
    // also reached) got a misleading SEASON_FULL instead of the normal
    // ended-season handling. Source-text assertion (see
    // simulation-service.season-end-autopilot.test.ts for the same pattern)
    // because forcing a real season-ended state requires a full victory
    // rollover, which is out of scope for this handler-level regression.
    // The cap gate lives in joinSeasonHandler (prepare-and-join-player.ts).
    const here = dirname(fileURLToPath(import.meta.url));
    const file = readFileSync(resolve(here, "prepare-and-join-player.ts"), "utf8");
    const joinStart = file.indexOf("export const joinSeasonHandler");
    const joinBody = file.slice(joinStart, joinStart + 800);
    const endedGuardIndex = joinBody.indexOf('.status === "ended"');
    const capGateIndex = joinBody.indexOf("seasonIsAtPlayerCap(");
    expect(endedGuardIndex).toBeGreaterThan(-1);
    expect(capGateIndex).toBeGreaterThan(-1);
    expect(capGateIndex).toBeGreaterThan(endedGuardIndex);
  });
});

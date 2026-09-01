import { describe, expect, it, vi } from "vitest";

import { handleGetPlayerCombatSummary, type ProtoPlayerCombatSummaryResponse } from "./player-combat-summary-snapshot.js";
import type { SimulationRuntime } from "./runtime/runtime.js";

const runCallback = (
  runtime: Pick<SimulationRuntime, "getPlayerCombatSummary">,
  playerId: string
): Promise<ProtoPlayerCombatSummaryResponse> =>
  new Promise((resolve, reject) => {
    handleGetPlayerCombatSummary(runtime as SimulationRuntime, { request: { player_id: playerId } }, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });

describe("handleGetPlayerCombatSummary", () => {
  it("returns found: false for a player the runtime has no record of", async () => {
    const runtime = { getPlayerCombatSummary: vi.fn().mockReturnValue(undefined) };

    const response = await runCallback(runtime, "ghost-player");

    expect(response).toEqual({ ok: true, found: false });
  });

  it("returns the runtime's authoritative tech/domain/factory data for a known player", async () => {
    const runtime = {
      getPlayerCombatSummary: vi.fn().mockReturnValue({
        techIds: ["tech-a"],
        domainIds: ["domain-a"],
        weaponsFactoryCounts: { titanium: 2, umbrite: 1 }
      })
    };

    const response = await runCallback(runtime, "player-2");

    expect(response).toEqual({
      ok: true,
      found: true,
      tech_ids: ["tech-a"],
      domain_ids: ["domain-a"],
      titanium_weapons_factory_count: 2,
      umbrite_weapons_factory_count: 1
    });
    expect(runtime.getPlayerCombatSummary).toHaveBeenCalledWith("player-2");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer } from "@border-empires/game-domain";
import { spendStrategicResource } from "../runtime-strategic-resource-ledger.js";
import { TITANIUM_LEVY_REGEN_FREEZE_KEY } from "../runtime-titanium-levy-command.js";
import { handleShardMobilizeCommand, SHARD_MOBILIZE_INVALID, type ShardMobilizeCommandContext } from "./shard-mobilize-command-handler.js";

const NOW = 1_700_000_000_000;
const CAP = 1_500;

const command: CommandEnvelope = {
  commandId: "cmd-mobilize",
  sessionId: "session-1",
  playerId: "p1",
  clientSeq: 1,
  issuedAt: NOW,
  type: "SHARD_MOBILIZE",
  payloadJson: "{}"
};

const makePlayer = (overrides: Partial<DomainPlayer> = {}): DomainPlayer =>
  ({ id: "p1", manpower: 120, manpowerBanked: 40, strategicResources: { SHARD: 2 }, ...overrides }) as DomainPlayer;

const makeContext = (player: DomainPlayer, cooldowns: Record<string, number> = {}) => {
  const events: SimulationEvent[] = [];
  const settleManpower = vi.fn();
  const emitPlayerStateUpdate = vi.fn();
  const invalidateEconomySnapshot = vi.fn();
  const emitPlayerMessage = vi.fn();
  const context: ShardMobilizeCommandContext = {
    players: new Map([[player.id, player]]),
    now: () => NOW,
    settleManpower,
    playerManpowerCap: () => CAP,
    getAbilityCooldownUntil: (_playerId, key) => cooldowns[key] ?? 0,
    spendStrategicResource,
    invalidateEconomySnapshot,
    emitEvent: (event) => events.push(event),
    emitPlayerStateUpdate,
    emitPlayerMessage
  };
  return { context, events, settleManpower, emitPlayerStateUpdate, emitPlayerMessage, invalidateEconomySnapshot };
};

const rejection = (events: SimulationEvent[]) => events.find((event) => event.eventType === "COMMAND_REJECTED");

describe("handleShardMobilizeCommand", () => {
  it("spends one Shard and refills manpower to the cap", () => {
    const player = makePlayer();
    const { context, events, settleManpower, emitPlayerStateUpdate, emitPlayerMessage, invalidateEconomySnapshot } = makeContext(player);

    handleShardMobilizeCommand(context, command);

    expect(settleManpower).toHaveBeenCalledWith(player);
    expect(player.manpower).toBe(CAP);
    expect(player.manpowerBanked).toBeUndefined();
    expect(player.strategicResources?.SHARD).toBe(1);
    expect(invalidateEconomySnapshot).toHaveBeenCalledWith("p1");
    expect(emitPlayerStateUpdate).toHaveBeenCalledWith(command);
    expect(emitPlayerMessage).toHaveBeenCalledWith(command, { type: "SHARD_MOBILIZED", delivered: CAP - 120 });
    expect(events.map((event) => event.eventType)).toEqual(["COMMAND_RESOLVED"]);
  });

  it("rejects without spending when the player has no Shard", () => {
    const player = makePlayer({ strategicResources: { SHARD: 0 } } as Partial<DomainPlayer>);
    const { context, events } = makeContext(player);

    handleShardMobilizeCommand(context, command);

    expect(rejection(events)).toMatchObject({ code: SHARD_MOBILIZE_INVALID });
    expect(player.manpower).toBe(120);
  });

  it("rejects without spending when manpower is already full", () => {
    const player = makePlayer({ manpower: CAP });
    const { context, events } = makeContext(player);

    handleShardMobilizeCommand(context, command);

    expect(rejection(events)).toMatchObject({ code: SHARD_MOBILIZE_INVALID, message: "manpower is already full" });
    expect(player.strategicResources?.SHARD).toBe(2);
  });

  it("does not trim overflow manpower (landing reserve / Waystation) down to the cap", () => {
    const player = makePlayer({ manpower: CAP + 800 });
    const { context, events } = makeContext(player);

    handleShardMobilizeCommand(context, command);

    expect(rejection(events)).toBeDefined();
    expect(player.manpower).toBe(CAP + 800);
    expect(player.strategicResources?.SHARD).toBe(2);
  });

  it("rejects while a Titanium Levy regen freeze is active, so the levy can't be refunded", () => {
    const player = makePlayer();
    const { context, events, settleManpower } = makeContext(player, { [TITANIUM_LEVY_REGEN_FREEZE_KEY]: NOW + 60_000 });

    handleShardMobilizeCommand(context, command);

    expect(rejection(events)).toMatchObject({ code: SHARD_MOBILIZE_INVALID });
    expect(settleManpower).not.toHaveBeenCalled();
    expect(player.manpower).toBe(120);
    expect(player.strategicResources?.SHARD).toBe(2);
  });
});

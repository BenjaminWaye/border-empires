import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { consumeFortWard, fortWardIsReady } from "./afc-battle-effects.js";
import { withAfcFortFacts } from "./afc-fort-facts.js";

const player = (id: string, ids: string[] = []) => ({ ...createHumanRuntimePlayer(id), afcUpgradeRuleset: "afc-v1" as const, domainIds: new Set(ids) });
const tile = (x: number, ownerId: string): DomainTileState => ({ x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

describe("Ablative Ward Network", () => {
  it("keeps ward recharge through rebuilding and ownership transfer", () => {
    const actor = player("p", ["afc-bastion-5"]), other = player("q", ["afc-bastion-5"]);
    const players = new Map([["p", actor], ["q", other]]); let now = 100;
    const fort: DomainTileState = { ...tile(1, "p"), fort: { ownerId: "p", status: "active" } };
    expect(fortWardIsReady(players, fort, now)).toBe(true);
    const until = consumeFortWard({ players, tiles: new Map([["1,0", fort]]), now: () => now, replaceTileState: () => {} }, fort, "attack");
    const rebuilt = { ...fort, ownerId: "q", fort: { ownerId: "q", status: "active" as const } };
    expect(fortWardIsReady(players, rebuilt, now)).toBe(false);
    expect(withAfcFortFacts(rebuilt, players).fort?.wardRechargesAt).toBe(until);
    now = until; expect(fortWardIsReady(players, rebuilt, now)).toBe(true);
  });
});

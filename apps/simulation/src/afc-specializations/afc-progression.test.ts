import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { buildTechUpdatePayload, chooseDomainForPlayer, techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildInitDomainCatalog } from "../../../realtime-gateway/src/init-payload/init-payload-catalogs.js";
import { domainCatalogForPlayer, reachableDomainChoices } from "../tech-domain-bridge/tech-domain-catalogs.js";

const afc: DomainTileState = { x: 2, y: 2, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", afc: { ownerId: "p", status: "active", modules: [] } };
const player = () => ({ ...createHumanRuntimePlayer("p"), afcUpgradeRuleset: "afc-v1" as const, points: 0,
  techIds: new Set([[...techEntryById.values()].find(tech => tech.tier === 5)!.id]) });

describe("authoritative free AFC choices", () => {
  it("installs with zero Coin and resources, closes the tier, and refuses replay", () => {
    const actor = player();
    expect(chooseDomainForPlayer(actor, "afc-vanguard-1", [afc])).toEqual({ ok: true });
    expect(actor.points).toBe(0);
    expect(actor.domainIds).toEqual(new Set(["afc-vanguard-1"]));
    expect(chooseDomainForPlayer(actor, "afc-vanguard-1", [afc]).ok).toBe(false);
    expect(chooseDomainForPlayer(actor, "afc-chancery-1", [afc]).ok).toBe(false);
    expect(chooseDomainForPlayer(actor, "afc-dominion-2", [afc]).ok).toBe(true);
  });
  it("requires the earliest unlocked tier and an active owned AFC", () => {
    const actor = player();
    expect(chooseDomainForPlayer(actor, "afc-vanguard-2", [afc]).ok).toBe(false);
    expect(chooseDomainForPlayer(actor, "afc-vanguard-1", []).ok).toBe(false);
    expect(chooseDomainForPlayer(actor, "afc-vanguard-1", [{ ...afc, ownerId: "enemy" }]).ok).toBe(false);
    actor.techIds.clear();
    expect(chooseDomainForPlayer(actor, "afc-vanguard-1", [afc]).ok).toBe(false);
  });
  it("keeps old-season selections and costs separate", () => {
    const actor = createHumanRuntimePlayer("p");
    const payload = buildTechUpdatePayload(actor, []);
    expect(payload.domainCatalog).toHaveLength(25);
    expect(payload.domainCatalog.every(upgrade => !upgrade.id.startsWith("afc-"))).toBe(true);
    expect(chooseDomainForPlayer(actor, "afc-vanguard-1", [afc]).ok).toBe(false);
  });
  it("uses the same catalogue and availability on INIT and live updates", () => {
    const actor = player();
    const update = buildTechUpdatePayload(actor, [afc]);
    const init = buildInitDomainCatalog(domainCatalogForPlayer(actor), { availableGold: 0, availableStrategic: {},
      reachableDomainChoiceSet: new Set(reachableDomainChoices([...actor.techIds], [], actor)) });
    expect(init).toEqual(update.domainCatalog);
    expect(init.filter(upgrade => upgrade.requirements.canResearch)).toHaveLength(6);
    expect(init.every(upgrade => upgrade.requirements.gold === 0 && Object.keys(upgrade.requirements.resources).length === 0)).toBe(true);
  });
  it("restores selected IDs and their ruleset without repeating grants", () => {
    const restored = createPlayersFromRecoveredState({ tiles: [], players: [{ id: "p", afcUpgradeRuleset: "afc-v1", domainIds: ["afc-exchequer-1"] }] })!.get("p")!;
    expect(restored.afcUpgradeRuleset).toBe("afc-v1");
    expect(restored.domainIds).toEqual(new Set(["afc-exchequer-1"]));
    expect(chooseDomainForPlayer(restored, "afc-exchequer-1", [afc]).ok).toBe(false);
  });
});

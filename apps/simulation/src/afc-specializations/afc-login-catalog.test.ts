import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { buildGatewayInitPayload } from "../../../realtime-gateway/src/init-payload/init-payload.js";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";
import { yieldToEventLoop } from "../event-loop-yield.js";

const playerId = "player-1";
const firstTech = [...techEntryById.values()].find(tech => tech.tier === 1)!;

for (const mode of ["sync", "async"] as const) {
  describe(`${mode} login AFC catalogue`, () => {
    it("offers six free tier-locked choices before the player's first selection at zero Coin", async () => {
      const runtime = new SimulationRuntime({
        now: () => 1000,
        initialPlayers: new Map([[playerId, buildPlayer(playerId, {
          afcUpgradeRuleset: "afc-v1", points: 0, techIds: new Set([firstTech.id]),
          afcCoreTownKeys: ["5,5"], afcScarcityFoodSlots: 2,
          afcCampaign: {}
        })]]),
        initialState: { tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: playerId, ownershipState: "SETTLED",
          afc: { ownerId: playerId, status: "active", modules: [] } }], activeLocks: [] }
      });
      const visible = mode === "sync" ? runtime.exportVisibleStateForPlayer(playerId)
        : await runtime.exportVisibleStateForPlayerAsync(playerId, yieldToEventLoop);
      expect(visible.players.find(p => p.id === playerId)).toMatchObject({
        afcUpgradeRuleset: "afc-v1", afcCoreTownKeys: ["5,5"], afcScarcityFoodSlots: 2
      });
      const subscription = buildPlayerSubscriptionSnapshot(playerId, visible, { tilesAlreadyVisible: true });
      expect(subscription.player?.afcUpgradeRuleset).toBe("afc-v1");
      expect(subscription.player?.afcUpgradeInstallAllowed).toBe(true);
      const init = buildGatewayInitPayload({ playerId, playerName: "Player" }, subscription, "default");
      expect(init.player).toMatchObject({ afcUpgradeRuleset: "afc-v1", afcUpgradeInstallAllowed: true });
      expect(init.player.afcInstallationPreviews).toBeDefined();
      expect(init.player.afcInstallationPreviews).toEqual(subscription.player?.afcInstallationPreviews);
      expect(init.domainCatalog).toHaveLength(30);
      expect(init.domainCatalog.every(upgrade => upgrade.id.startsWith("afc-") && upgrade.requirements.gold === 0 && Object.keys(upgrade.requirements.resources).length === 0)).toBe(true);
      expect(init.domainChoices).toHaveLength(6);
      expect(init.domainChoices.every(id => id.endsWith("-1"))).toBe(true);
      expect(init.domainCatalog.filter(upgrade => upgrade.requirements.canResearch)).toHaveLength(6);
    });
  });
}

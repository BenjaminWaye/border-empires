import { describe, expect, it } from "vitest";
import { hydrateVisibleLiveProfileOverrides, recoverLivePlayerMessage } from "./live-world-status-recovery.js";
import { createPlayerProfileOverrides } from "./player-profile-overrides.js";
import type { GatewayPlayerProfileStore, StoredPlayerProfile } from "./player-profile-store/player-profile-store.js";

const storeWithProfiles = (profiles: StoredPlayerProfile[]): GatewayPlayerProfileStore => {
  const byId = new Map(profiles.map((profile) => [profile.playerId, profile]));
  return {
    async get(playerId) {
      return byId.get(playerId);
    },
    async getMany(playerIds) {
      return [...playerIds].map((id) => byId.get(id)).filter((p): p is StoredPlayerProfile => Boolean(p));
    },
    async listAllNamed() {
      return [...byId.values()].filter((p) => p.name);
    },
    async setTileColor(playerId, tileColor) {
      const existing = byId.get(playerId) ?? { playerId, updatedAt: 0 };
      const updated = { ...existing, tileColor };
      byId.set(playerId, updated);
      return updated;
    },
    async setProfile(playerId, name, tileColor) {
      const existing = byId.get(playerId) ?? { playerId, updatedAt: 0 };
      const updated = { ...existing, name, tileColor };
      byId.set(playerId, updated);
      return updated;
    },
    async setCountryFlag(playerId, countryFlag) {
      const existing = byId.get(playerId) ?? { playerId, updatedAt: 0 };
      const updated = { ...existing, countryFlag };
      byId.set(playerId, updated);
      return updated;
    }
  };
};

describe("live-world-status-recovery attack alert name hydration", () => {
  it("replaces the simulation-supplied attackerName with the attacker's real live profile name", async () => {
    const opaqueId = "VK5iriJAhickNf9ArrRweUDnq1W2";
    const profileStore = storeWithProfiles([{ playerId: opaqueId, name: "Björn the Bold", updatedAt: 0 }]);
    const profileOverrides = createPlayerProfileOverrides();

    const payload: Record<string, unknown> = {
      type: "ATTACK_ALERT",
      attackerId: opaqueId,
      attackerName: opaqueId, // simulation never learned the real display name
      x: 85,
      y: 369
    };

    await hydrateVisibleLiveProfileOverrides(payload, profileStore, profileOverrides);
    const recovered = recoverLivePlayerMessage(payload, profileOverrides);

    expect(recovered.attackerName).toBe("Björn the Bold");
  });

  it("leaves attackerName untouched when the attacker has no stored profile name", async () => {
    const profileStore = storeWithProfiles([]);
    const profileOverrides = createPlayerProfileOverrides();

    const payload: Record<string, unknown> = {
      type: "ATTACK_ALERT",
      attackerId: "player-1",
      attackerName: "Empire A1B2C3",
      x: 1,
      y: 2
    };

    await hydrateVisibleLiveProfileOverrides(payload, profileStore, profileOverrides);
    const recovered = recoverLivePlayerMessage(payload, profileOverrides);

    expect(recovered.attackerName).toBe("Empire A1B2C3");
  });

  // Regression: AETHER_PURGE_ALERT shares ATTACK_ALERT's attackerId/attackerName
  // shape but was omitted from both the "which players need hydrating" check
  // and the "patch attackerName from the override" check, so purge alerts kept
  // showing the simulation's anonymized "Empire XXXXXX" fallback name even for
  // attackers with a real display name set.
  it("replaces the simulation-supplied attackerName on an AETHER_PURGE_ALERT too", async () => {
    const opaqueId = "VK5iriJAhickNf9ArrRweUDnq1W2";
    const profileStore = storeWithProfiles([{ playerId: opaqueId, name: "Björn the Bold", updatedAt: 0 }]);
    const profileOverrides = createPlayerProfileOverrides();

    const payload: Record<string, unknown> = {
      type: "AETHER_PURGE_ALERT",
      attackerId: opaqueId,
      attackerName: "Empire ZOE10T", // simulation never learned the real display name
      x: 85,
      y: 369
    };

    await hydrateVisibleLiveProfileOverrides(payload, profileStore, profileOverrides);
    const recovered = recoverLivePlayerMessage(payload, profileOverrides);

    expect(recovered.attackerName).toBe("Björn the Bold");
  });
});

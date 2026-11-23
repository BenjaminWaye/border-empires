import {
  COSMETIC_CATALOG,
  cosmeticBelongsToSlot,
  isCosmeticId,
  isCosmeticSlot,
  isEmptyCosmeticSelection,
  type CosmeticId,
  type PlayerCosmeticSelection
} from "@border-empires/shared";

import { MAX_LOADED_COSMETIC_SELECTIONS, type AccountCosmeticsStore } from "./account-cosmetics-store.js";

// Gateway side of account cosmetics: who owns what, what each account shows,
// and telling every connected player when that changes.
//
// Wire cost. Only accounts with a non-default look are ever sent: a player who
// owns nothing adds no bytes to INIT or to any broadcast. A selection is two
// short ids at most (about 60 bytes as JSON).
//
// Memory. `shown` holds one small object per account with a non-default look
// on this server. It is loaded once at boot with a hard limit and reported as
// a gauge (see renderMetrics).

export type AccountCosmeticsServiceDeps = {
  store: AccountCosmeticsStore;
  /** Sends a PLAYER_STYLE payload to every connected socket. */
  broadcastToAll: (payload: { type: "PLAYER_STYLE"; playerId: string; cosmetics: PlayerCosmeticSelection }) => void;
  /** Sends a payload to every socket of one player. */
  sendToPlayer: (playerId: string, payload: unknown) => void;
  log?: (message: string, detail: Record<string, unknown>) => void;
};

export type CosmeticGrantOutcome =
  | { ok: true; newlyGranted: boolean; owned: CosmeticId[] }
  | { ok: false; error: "unknown_cosmetic" | "invalid_player" };

export type AccountCosmeticsService = {
  /** Loads the shown looks into memory. Call once before accepting sockets. */
  hydrate: () => Promise<void>;
  /** Looks every other player must see, for the INIT message. */
  shownSelections: () => Record<string, PlayerCosmeticSelection>;
  /**
   * The one way an account comes to own a cosmetic. Server side only: the
   * admin route calls it today and the payment webhook will call it later.
   * No client message reaches it.
   */
  grant: (playerId: string, cosmeticId: string, grantRef: string) => Promise<CosmeticGrantOutcome>;
  revoke: (playerId: string, cosmeticId: string) => Promise<CosmeticGrantOutcome>;
  handleClientMessage: (
    playerId: string | undefined,
    message: { type: "REQUEST_COSMETICS" } | { type: "SET_COSMETIC"; slot: string; cosmeticId: string | null },
    reply: (payload: unknown) => void
  ) => Promise<void>;
  renderMetrics: () => Promise<string>;
};

export const createAccountCosmeticsService = (deps: AccountCosmeticsServiceDeps): AccountCosmeticsService => {
  const { store } = deps;
  const shown = new Map<string, PlayerCosmeticSelection>();
  let hydrateTruncated = 0;
  let shownCapRejections = 0;

  const remember = (playerId: string, selection: PlayerCosmeticSelection): void => {
    if (isEmptyCosmeticSelection(selection)) {
      shown.delete(playerId);
      return;
    }
    if (!shown.has(playerId) && shown.size >= MAX_LOADED_COSMETIC_SELECTIONS) {
      // The choice is still saved; other players see the default look until
      // the limit is raised. Counted so it cannot happen silently.
      shownCapRejections += 1;
      deps.log?.("account cosmetics shown-look limit reached", { limit: MAX_LOADED_COSMETIC_SELECTIONS });
      return;
    }
    shown.set(playerId, selection);
  };

  const stateFor = async (playerId: string): Promise<{ type: "COSMETICS_STATE"; owned: CosmeticId[]; selected: PlayerCosmeticSelection }> => ({
    type: "COSMETICS_STATE",
    owned: await store.listOwned(playerId),
    selected: await store.getSelection(playerId)
  });

  const publish = (playerId: string, selection: PlayerCosmeticSelection): void => {
    remember(playerId, selection);
    deps.broadcastToAll({ type: "PLAYER_STYLE", playerId, cosmetics: selection });
  };

  return {
    async hydrate() {
      const { selections, truncated } = await store.listSelections(MAX_LOADED_COSMETIC_SELECTIONS);
      shown.clear();
      for (const [playerId, selection] of selections) shown.set(playerId, selection);
      if (truncated) {
        hydrateTruncated += 1;
        deps.log?.("account cosmetics shown looks truncated at boot", { limit: MAX_LOADED_COSMETIC_SELECTIONS });
      }
    },

    shownSelections() {
      return Object.fromEntries(shown);
    },

    async grant(playerId, cosmeticId, grantRef) {
      if (typeof playerId !== "string" || playerId.length === 0 || playerId.length > 200) return { ok: false, error: "invalid_player" };
      if (!isCosmeticId(cosmeticId)) return { ok: false, error: "unknown_cosmetic" };
      const { newlyGranted } = await store.grant(playerId, cosmeticId, grantRef.slice(0, 200) || "unspecified");
      const state = await stateFor(playerId);
      if (newlyGranted) deps.sendToPlayer(playerId, state);
      return { ok: true, newlyGranted, owned: state.owned };
    },

    async revoke(playerId, cosmeticId) {
      if (typeof playerId !== "string" || playerId.length === 0) return { ok: false, error: "invalid_player" };
      if (!isCosmeticId(cosmeticId)) return { ok: false, error: "unknown_cosmetic" };
      const before = shown.get(playerId);
      const { revoked } = await store.revoke(playerId, cosmeticId);
      const state = await stateFor(playerId);
      if (before && JSON.stringify(before) !== JSON.stringify(state.selected)) publish(playerId, state.selected);
      if (revoked) deps.sendToPlayer(playerId, state);
      return { ok: true, newlyGranted: false, owned: state.owned };
    },

    async handleClientMessage(playerId, message, reply) {
      if (!playerId) {
        reply({ type: "ERROR", code: "NO_AUTH", message: "auth first" });
        return;
      }
      if (message.type === "REQUEST_COSMETICS") {
        reply(await stateFor(playerId));
        return;
      }
      const { slot, cosmeticId } = message;
      if (!isCosmeticSlot(slot) || (cosmeticId !== null && !(isCosmeticId(cosmeticId) && cosmeticBelongsToSlot(cosmeticId, slot)))) {
        reply({ type: "ERROR", code: "COSMETIC_INVALID", message: "That cosmetic does not exist." });
        return;
      }
      if (cosmeticId !== null && !(await store.listOwned(playerId)).includes(cosmeticId)) {
        reply({ type: "ERROR", code: "COSMETIC_NOT_OWNED", message: "Your account does not own that cosmetic." });
        return;
      }
      const selection = await store.setSelection(playerId, slot, cosmeticId);
      publish(playerId, selection);
      reply(await stateFor(playerId));
    },

    async renderMetrics() {
      const counts = await store.counts();
      return `\n# TYPE gateway_account_cosmetics_owned gauge\ngateway_account_cosmetics_owned ${counts.owned}\n` +
        `# TYPE gateway_account_cosmetics_selected gauge\ngateway_account_cosmetics_selected ${counts.selected}\n` +
        `# TYPE gateway_account_cosmetics_shown_accounts gauge\ngateway_account_cosmetics_shown_accounts ${shown.size}\n` +
        `# TYPE gateway_account_cosmetics_catalog_size gauge\ngateway_account_cosmetics_catalog_size ${COSMETIC_CATALOG.length}\n` +
        `# TYPE gateway_account_cosmetics_shown_cap_rejections_total counter\ngateway_account_cosmetics_shown_cap_rejections_total ${shownCapRejections + hydrateTruncated}\n`;
    }
  };
};

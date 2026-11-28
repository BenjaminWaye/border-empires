import {
  COSMETIC_CATALOG,
  cosmeticBelongsToSlot,
  accountTitleFor,
  cosmeticProduct,
  isCosmeticId,
  isCosmeticSlot,
  isEmptyCosmeticSelection,
  isFreeCosmetic,
  ownedWithFreeCosmetics,
  type AccountTitle,
  type CosmeticId,
  type CosmeticSlot,
  type CrestCosmeticId,
  type PlayerCosmeticSelection
} from "@border-empires/shared";

import { PROFILE_CHANGE_LIMIT_REASON, profileChangeUsed } from "../profile-change-allowance/profile-change-allowance.js";

import {
  MAX_LOADED_COSMETIC_SELECTIONS,
  MAX_LOADED_FREE_COSMETIC_SELECTIONS,
  shownLookKind,
  type AccountCosmeticsStore,
  type ShownLookKind
} from "./account-cosmetics-store.js";

// Gateway side of account cosmetics: who owns what, what each account shows,
// and telling every connected player when that changes.
//
// Wire cost. Only accounts with a non-default look are ever sent: a player who
// shows no cosmetic adds no bytes to INIT or to any broadcast. A selection is
// one short id per slot (about 90 bytes as JSON with all three).
//
// Memory. `shown` holds one small object per account with a non-default look
// on this server, in two sets with their own hard limits: looks with a paid
// cosmetic, and looks with only free ones (House crests), so free crests can
// never push a paid look out. Loaded once at boot and reported as gauges (see
// renderMetrics).

export type AccountCosmeticsServiceDeps = {
  store: AccountCosmeticsStore;
  /** Sends a PLAYER_STYLE payload to every connected socket. */
  broadcastToAll: (payload: { type: "PLAYER_STYLE"; playerId: string; cosmetics: PlayerCosmeticSelection }) => void;
  /** Sends a payload to every socket of one player. */
  sendToPlayer: (playerId: string, payload: unknown) => void;
  log?: (message: string, detail: Record<string, unknown>) => void;
  now?: () => number;
  /** The current Sector Contest's season id: the crest can change once per contest. Undefined when unknown (no limit applied). */
  getCurrentSeasonId?: () => Promise<string | undefined>;
};

// The crest is the House's emblem and, like the name and colour, changes once
// per Sector Contest (profile-change-allowance.ts); the first pick, from the
// letter to a crest, counts. Paid looks (muster flag, ancillaries) stay free to swap.
export const ONCE_PER_CONTEST_COSMETIC_SLOTS: ReadonlySet<CosmeticSlot> = new Set<CosmeticSlot>(["crest"]);

// A look change is broadcast to every socket, so one player may change looks
// at most this often; a request that changes nothing broadcasts nothing.
export const COSMETIC_CHANGE_MIN_INTERVAL_MS = 1_000;
// Bound on remembered change times; older than the interval are dropped first.
const MAX_TRACKED_CHANGE_TIMES = 1_000;

// `owned` here is what the account was granted; free cosmetics are left out.
export type CosmeticGrantOutcome =
  | { ok: true; newlyGranted: boolean; owned: CosmeticId[] }
  | { ok: false; error: "unknown_cosmetic" | "unknown_product" | "invalid_player" };

export type AccountCosmeticsService = {
  /** Loads the shown looks into memory. Call once before accepting sockets. */
  hydrate: () => Promise<void>;
  /** Every look other players must see (tests and diagnostics). */
  shownSelections: () => Record<string, PlayerCosmeticSelection>;
  /** One account's shown look, for INIT (filtered to the world's players). */
  shownSelectionFor: (playerId: string) => PlayerCosmeticSelection | undefined;
  /**
   * The one way an account comes to own a cosmetic. Server side only: the
   * admin route calls it today and the payment webhook will call it later.
   * No client message reaches it.
   */
  grant: (playerId: string, cosmeticId: string, grantRef: string) => Promise<CosmeticGrantOutcome>;
  /** Grants every cosmetic a shop product includes (COSMETIC_PRODUCTS) --
   * what the payment webhook calls after a purchase. Idempotent, like grant;
   * `newlyGranted` is true when any of them was new. */
  grantProduct: (playerId: string, productId: string, grantRef: string) => Promise<CosmeticGrantOutcome>;
  revoke: (playerId: string, cosmeticId: string) => Promise<CosmeticGrantOutcome>;
  /**
   * Gives a House that shows no crest this one, as if picked, without spending
   * its once-per-contest crest change: AI Houses at boot and guests at first
   * login (owner decision 2026-11-28). Never throws; resolves true when set.
   */
  assignDefaultCrest: (playerId: string, crest: CrestCosmeticId) => Promise<boolean>;
  /** The title the account holds (accountTitleFor), for the roster and the public profile. */
  titleOf: (playerId: string) => Promise<AccountTitle | undefined>;
  handleClientMessage: (
    playerId: string | undefined,
    message: { type: "REQUEST_COSMETICS" } | { type: "SET_COSMETIC"; slot: string; cosmeticId: string | null },
    reply: (payload: unknown) => void
  ) => Promise<void>;
  renderMetrics: () => Promise<string>;
};

export const createAccountCosmeticsService = (deps: AccountCosmeticsServiceDeps): AccountCosmeticsService => {
  const { store } = deps;
  const shown: Record<ShownLookKind, Map<string, PlayerCosmeticSelection>> = { paid: new Map(), freeOnly: new Map() };
  const shownLimit: Record<ShownLookKind, number> = { paid: MAX_LOADED_COSMETIC_SELECTIONS, freeOnly: MAX_LOADED_FREE_COSMETIC_SELECTIONS };
  const shownLookOf = (playerId: string): PlayerCosmeticSelection | undefined => shown.paid.get(playerId) ?? shown.freeOnly.get(playerId);
  let hydrateTruncated = 0;
  let shownCapRejections = 0;
  let defaultCrestsAssigned = 0;
  let defaultCrestFailures = 0;
  const now = deps.now ?? (() => Date.now());
  const lastChangeAt = new Map<string, number>();
  const changedTooRecently = (playerId: string, at: number): boolean => {
    const last = lastChangeAt.get(playerId);
    if (last !== undefined && at - last < COSMETIC_CHANGE_MIN_INTERVAL_MS) return true;
    lastChangeAt.delete(playerId);
    lastChangeAt.set(playerId, at);
    if (lastChangeAt.size > MAX_TRACKED_CHANGE_TIMES) {
      for (const [id, when] of lastChangeAt) {
        if (at - when < COSMETIC_CHANGE_MIN_INTERVAL_MS) break;
        lastChangeAt.delete(id);
      }
    }
    return false;
  };

  const remember = (playerId: string, selection: PlayerCosmeticSelection): void => {
    if (isEmptyCosmeticSelection(selection)) {
      shown.paid.delete(playerId);
      shown.freeOnly.delete(playerId);
      return;
    }
    const kind = shownLookKind(selection);
    const set = shown[kind];
    if (!set.has(playerId) && set.size >= shownLimit[kind]) {
      // The choice is still saved; other players see the old look until the
      // limit is raised. Counted so it cannot happen silently.
      shownCapRejections += 1;
      deps.log?.("account cosmetics shown-look limit reached", { kind, limit: shownLimit[kind] });
      return;
    }
    shown[kind === "paid" ? "freeOnly" : "paid"].delete(playerId);
    set.set(playerId, selection);
  };

  const stateFor = async (playerId: string): Promise<{ type: "COSMETICS_STATE"; owned: CosmeticId[]; selected: PlayerCosmeticSelection }> => ({
    type: "COSMETICS_STATE",
    // Free cosmetics (House crests) are owned by everyone without a stored grant.
    owned: ownedWithFreeCosmetics(await store.listOwned(playerId)),
    selected: await store.getSelection(playerId)
  });

  const crestChangeUsed = async (playerId: string, seasonId: string | undefined): Promise<boolean> =>
    profileChangeUsed(seasonId ? await store.slotChangedSeasonId(playerId, "crest") : undefined, seasonId);

  /** COSMETICS_STATE for the player's own requests, with whether this contest's crest change is spent. */
  const replyStateFor = async (playerId: string, seasonId?: string) => {
    const season = seasonId ?? (await deps.getCurrentSeasonId?.());
    return { ...(await stateFor(playerId)), crestChangeUsed: await crestChangeUsed(playerId, season) };
  };

  const publish = (playerId: string, selection: PlayerCosmeticSelection): void => {
    remember(playerId, selection);
    deps.broadcastToAll({ type: "PLAYER_STYLE", playerId, cosmetics: selection });
  };

  const service: AccountCosmeticsService = {
    async hydrate() {
      for (const kind of ["paid", "freeOnly"] as const) {
        const { selections, truncated } = await store.listSelections(shownLimit[kind], kind);
        shown[kind].clear();
        for (const [playerId, selection] of selections) shown[kind].set(playerId, selection);
        if (truncated) {
          hydrateTruncated += 1;
          deps.log?.("account cosmetics shown looks truncated at boot", { kind, limit: shownLimit[kind] });
        }
      }
    },

    shownSelections() {
      return Object.fromEntries([...shown.freeOnly, ...shown.paid]);
    },

    shownSelectionFor: shownLookOf,

    async grant(playerId, cosmeticId, grantRef) {
      if (typeof playerId !== "string" || playerId.length === 0 || playerId.length > 200) return { ok: false, error: "invalid_player" };
      if (!isCosmeticId(cosmeticId)) return { ok: false, error: "unknown_cosmetic" };
      // Every account owns a free cosmetic already; it is never stored as a grant.
      if (isFreeCosmetic(cosmeticId)) return { ok: true, newlyGranted: false, owned: await store.listOwned(playerId) };
      const { newlyGranted } = await store.grant(playerId, cosmeticId, grantRef.slice(0, 200) || "unspecified");
      const state = await stateFor(playerId);
      if (newlyGranted) deps.sendToPlayer(playerId, state);
      return { ok: true, newlyGranted, owned: await store.listOwned(playerId) };
    },

    async grantProduct(playerId, productId, grantRef) {
      const product = cosmeticProduct(productId);
      if (!product) return { ok: false, error: "unknown_product" };
      let last: CosmeticGrantOutcome = { ok: false, error: "unknown_product" };
      let anyNew = false;
      for (const cosmeticId of product.grants) {
        last = await service.grant(playerId, cosmeticId, grantRef);
        if (!last.ok) return last;
        anyNew ||= last.newlyGranted;
      }
      return last.ok ? { ...last, newlyGranted: anyNew } : last;
    },

    async assignDefaultCrest(playerId, crest) {
      try {
        if (shownLookOf(playerId)?.crest) return false;
        if ((await store.getSelection(playerId)).crest) return false;
        publish(playerId, await store.setSelection(playerId, "crest", crest));
        defaultCrestsAssigned += 1;
        return true;
      } catch (error) {
        defaultCrestFailures += 1;
        deps.log?.("default House crest not assigned", { playerId, error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },

    async titleOf(playerId) {
      return accountTitleFor(await store.listOwned(playerId));
    },

    async revoke(playerId, cosmeticId) {
      if (typeof playerId !== "string" || playerId.length === 0) return { ok: false, error: "invalid_player" };
      if (!isCosmeticId(cosmeticId)) return { ok: false, error: "unknown_cosmetic" };
      // A free cosmetic (a House crest) cannot be taken back, so its selection stays.
      if (isFreeCosmetic(cosmeticId)) return { ok: true, newlyGranted: false, owned: await store.listOwned(playerId) };
      const before = shownLookOf(playerId);
      const { revoked } = await store.revoke(playerId, cosmeticId);
      const state = await stateFor(playerId);
      if (before && JSON.stringify(before) !== JSON.stringify(state.selected)) publish(playerId, state.selected);
      if (revoked) deps.sendToPlayer(playerId, state);
      return { ok: true, newlyGranted: false, owned: await store.listOwned(playerId) };
    },

    async handleClientMessage(playerId, message, reply) {
      if (!playerId) {
        reply({ type: "ERROR", code: "NO_AUTH", message: "auth first" });
        return;
      }
      if (message.type === "REQUEST_COSMETICS") {
        reply(await replyStateFor(playerId));
        return;
      }
      // Refusals name the slot, so the client settles only the save it was waiting on.
      const { slot, cosmeticId } = message;
      if (!isCosmeticSlot(slot) || (cosmeticId !== null && !(isCosmeticId(cosmeticId) && cosmeticBelongsToSlot(cosmeticId, slot)))) {
        reply({ type: "ERROR", code: "COSMETIC_INVALID", message: "That cosmetic does not exist.", slot });
        return;
      }
      if (cosmeticId !== null && !isFreeCosmetic(cosmeticId) && !(await store.listOwned(playerId)).includes(cosmeticId)) {
        reply({ type: "ERROR", code: "COSMETIC_NOT_OWNED", message: "Your account does not own that cosmetic.", slot });
        return;
      }
      if (((await store.getSelection(playerId))[slot] ?? null) === cosmeticId) {
        reply(await replyStateFor(playerId));
        return;
      }
      const limited = ONCE_PER_CONTEST_COSMETIC_SLOTS.has(slot);
      const seasonId = limited ? await deps.getCurrentSeasonId?.() : undefined;
      if (limited && (await crestChangeUsed(playerId, seasonId))) {
        reply({ type: "ERROR", code: "COSMETIC_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.crest, slot });
        return;
      }
      if (changedTooRecently(playerId, now())) {
        reply({ type: "ERROR", code: "COSMETIC_RATE_LIMITED", message: "Wait a moment before changing your look again.", slot });
        return;
      }
      const selection = await store.setSelection(playerId, slot, cosmeticId);
      if (limited && seasonId) await store.recordSlotChange(playerId, slot, seasonId);
      publish(playerId, selection);
      reply(await replyStateFor(playerId, seasonId));
    },

    async renderMetrics() {
      const counts = await store.counts();
      return `\n# TYPE gateway_account_cosmetics_owned gauge\ngateway_account_cosmetics_owned ${counts.owned}\n` +
        `# TYPE gateway_account_cosmetics_selected gauge\ngateway_account_cosmetics_selected ${counts.selected}\n` +
        `# TYPE gateway_account_cosmetics_shown_accounts gauge\ngateway_account_cosmetics_shown_accounts ${shown.paid.size + shown.freeOnly.size}\n` +
        `# TYPE gateway_account_cosmetics_shown_free_only_accounts gauge\ngateway_account_cosmetics_shown_free_only_accounts ${shown.freeOnly.size}\n` +
        `# TYPE gateway_account_cosmetics_catalog_size gauge\ngateway_account_cosmetics_catalog_size ${COSMETIC_CATALOG.length}\n` +
        `# TYPE gateway_account_cosmetics_shown_cap_rejections_total counter\ngateway_account_cosmetics_shown_cap_rejections_total ${shownCapRejections + hydrateTruncated}\n` +
        `# TYPE gateway_account_cosmetics_default_crests_assigned_total counter\ngateway_account_cosmetics_default_crests_assigned_total ${defaultCrestsAssigned}\n` +
        `# TYPE gateway_account_cosmetics_default_crest_failures_total counter\ngateway_account_cosmetics_default_crest_failures_total ${defaultCrestFailures}\n`;
    }
  };
  return service;
};

import {
  cosmeticDefinition,
  sanitizeCosmeticSelection,
  type CosmeticId,
  type CosmeticSlot,
  type PlayerCosmeticSelection
} from "@border-empires/shared";

// Which cosmetics an account owns and which one it shows per slot
// (docs/gdd.md §8). The account key is the gateway player id: it is the same
// in every Sector Contest on this server.
//
// The store is per server database. A hosted sector runs on its own server,
// so the hosted-sector payment work must call `grant` on each server an
// account plays on (or replace this store with a central one).

/** Hard bound on the selections loaded into memory at boot. */
export const MAX_LOADED_COSMETIC_SELECTIONS = 5_000;

export type CosmeticGrantResult = { newlyGranted: boolean };

export interface AccountCosmeticsStore {
  listOwned(playerId: string): Promise<CosmeticId[]>;
  /**
   * Gives an account a cosmetic for good. `grantRef` records why (for example
   * "admin" or a payment id) and is never shown to players. Idempotent.
   */
  grant(playerId: string, cosmeticId: CosmeticId, grantRef: string): Promise<CosmeticGrantResult>;
  /** Takes a cosmetic back (a refund) and stops the account showing it. */
  revoke(playerId: string, cosmeticId: CosmeticId): Promise<{ revoked: boolean }>;
  getSelection(playerId: string): Promise<PlayerCosmeticSelection>;
  /** `null` returns the slot to the default look. Does not check ownership. */
  setSelection(playerId: string, slot: CosmeticSlot, cosmeticId: CosmeticId | null): Promise<PlayerCosmeticSelection>;
  /** Every account with a non-default look, at most `limit` accounts. */
  listSelections(limit: number): Promise<{ selections: Array<[string, PlayerCosmeticSelection]>; truncated: boolean }>;
  counts(): Promise<{ owned: number; selected: number }>;
}

export class InMemoryAccountCosmeticsStore implements AccountCosmeticsStore {
  private readonly ownedByPlayerId = new Map<string, Set<CosmeticId>>();
  private readonly selectionByPlayerId = new Map<string, PlayerCosmeticSelection>();

  async listOwned(playerId: string): Promise<CosmeticId[]> {
    return [...(this.ownedByPlayerId.get(playerId) ?? [])];
  }

  async grant(playerId: string, cosmeticId: CosmeticId): Promise<CosmeticGrantResult> {
    const owned = this.ownedByPlayerId.get(playerId) ?? new Set<CosmeticId>();
    this.ownedByPlayerId.set(playerId, owned);
    if (owned.has(cosmeticId)) return { newlyGranted: false };
    owned.add(cosmeticId);
    return { newlyGranted: true };
  }

  async revoke(playerId: string, cosmeticId: CosmeticId): Promise<{ revoked: boolean }> {
    const revoked = this.ownedByPlayerId.get(playerId)?.delete(cosmeticId) ?? false;
    const slot = cosmeticDefinition(cosmeticId)?.slot;
    if (slot && this.selectionByPlayerId.get(playerId)?.[slot] === cosmeticId) await this.setSelection(playerId, slot, null);
    return { revoked };
  }

  async getSelection(playerId: string): Promise<PlayerCosmeticSelection> {
    return { ...(this.selectionByPlayerId.get(playerId) ?? {}) };
  }

  async setSelection(playerId: string, slot: CosmeticSlot, cosmeticId: CosmeticId | null): Promise<PlayerCosmeticSelection> {
    const next: Record<string, string> = { ...(this.selectionByPlayerId.get(playerId) ?? {}) };
    if (cosmeticId === null) delete next[slot];
    else next[slot] = cosmeticId;
    const selection = sanitizeCosmeticSelection(next);
    if (Object.keys(selection).length === 0) this.selectionByPlayerId.delete(playerId);
    else this.selectionByPlayerId.set(playerId, selection);
    return { ...selection };
  }

  async listSelections(limit: number): Promise<{ selections: Array<[string, PlayerCosmeticSelection]>; truncated: boolean }> {
    const all = [...this.selectionByPlayerId.entries()];
    return { selections: all.slice(0, limit).map(([id, selection]) => [id, { ...selection }]), truncated: all.length > limit };
  }

  async counts(): Promise<{ owned: number; selected: number }> {
    let owned = 0;
    for (const set of this.ownedByPlayerId.values()) owned += set.size;
    let selected = 0;
    for (const selection of this.selectionByPlayerId.values()) selected += Object.keys(selection).length;
    return { owned, selected };
  }
}

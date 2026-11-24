// Public House profile links (docs/gdd.md §7). A human's playerId is normally
// their Firebase uid, so the shareable web link carries a separate random
// public id instead. A row exists only once the account's owner asks for a
// link; removing it (or erasing the account, scripts/account-deletion) makes
// the public page disappear.
import { randomBytes } from "node:crypto";

export type PublicProfileLink = { publicId: string; playerId: string; createdAt: number };

export type PublicProfileLinkStore = {
  /** The player's link, minted on first call. */
  getOrCreate: (playerId: string, now: number) => Promise<PublicProfileLink>;
  getByPlayerId: (playerId: string) => Promise<PublicProfileLink | undefined>;
  getByPublicId: (publicId: string) => Promise<PublicProfileLink | undefined>;
  /** Resolves true when a link was removed. A later getOrCreate mints a new id; the old link stays dead. */
  remove: (playerId: string) => Promise<boolean>;
};

/** 16 url-safe characters, 96 random bits: not guessable, not derived from any account id. */
export const newPublicProfileId = (): string => randomBytes(12).toString("base64url");

export const isPublicProfileId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16}$/.test(value);

/** Dev and test store. One entry per account that asked for a link, so it is bounded by the account count. */
export class InMemoryPublicProfileLinkStore implements PublicProfileLinkStore {
  private readonly byPlayerId = new Map<string, PublicProfileLink>();

  async getOrCreate(playerId: string, now: number): Promise<PublicProfileLink> {
    const existing = this.byPlayerId.get(playerId);
    if (existing) return { ...existing };
    const link = { publicId: newPublicProfileId(), playerId, createdAt: now };
    this.byPlayerId.set(playerId, link);
    return { ...link };
  }

  async getByPlayerId(playerId: string): Promise<PublicProfileLink | undefined> {
    const link = this.byPlayerId.get(playerId);
    return link ? { ...link } : undefined;
  }

  async getByPublicId(publicId: string): Promise<PublicProfileLink | undefined> {
    for (const link of this.byPlayerId.values()) if (link.publicId === publicId) return { ...link };
    return undefined;
  }

  async remove(playerId: string): Promise<boolean> {
    return this.byPlayerId.delete(playerId);
  }
}

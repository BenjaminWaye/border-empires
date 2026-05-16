export type RallyAnchor = {
  x: number;
  y: number;
  island: string;
};

export type RallyLink = {
  code: string;
  ownerPlayerId: string;
  ownerName: string;
  note?: string;
  anchor: RallyAnchor;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  uses: number;
  revokedAt?: number;
};

export type RallyLinkPublicView = Omit<RallyLink, "uses" | "revokedAt" | "note"> & {
  url: string;
  usesRemaining: number;
  note?: string;
};

export type CreateRallyLinkInput = {
  code: string;
  ownerPlayerId: string;
  ownerName: string;
  note?: string;
  anchor: RallyAnchor;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
};

export type RallyLinkStore = {
  create(input: CreateRallyLinkInput): Promise<RallyLink>;
  get(code: string): Promise<RallyLink | undefined>;
  listActiveForOwner(ownerPlayerId: string, now: number): Promise<RallyLink[]>;
  countCreatedSince(ownerPlayerId: string, since: number): Promise<number>;
  revoke(ownerPlayerId: string, code: string, now: number): Promise<boolean>;
  consume(code: string, now: number): Promise<RallyLink | undefined>;
  releaseUse(code: string): Promise<void>;
};

export const rallyLinkIsActive = (link: RallyLink, now: number): boolean =>
  !link.revokedAt && link.expiresAt > now && link.uses < link.maxUses;

export const toRallyLinkPublicView = (link: RallyLink, playOrigin: string): RallyLinkPublicView => ({
  code: link.code,
  url: `${playOrigin.replace(/\/$/, "")}/r/${encodeURIComponent(link.code)}`,
  ownerPlayerId: link.ownerPlayerId,
  ownerName: link.ownerName,
  ...(link.note ? { note: link.note } : {}),
  anchor: link.anchor,
  createdAt: link.createdAt,
  expiresAt: link.expiresAt,
  maxUses: link.maxUses,
  usesRemaining: Math.max(0, link.maxUses - link.uses)
});

export class InMemoryRallyLinkStore implements RallyLinkStore {
  private readonly links = new Map<string, RallyLink>();

  async create(input: CreateRallyLinkInput): Promise<RallyLink> {
    const link: RallyLink = { ...input, uses: 0 };
    this.links.set(link.code, link);
    return { ...link };
  }

  async get(code: string): Promise<RallyLink | undefined> {
    const link = this.links.get(code);
    return link ? { ...link, anchor: { ...link.anchor } } : undefined;
  }

  async listActiveForOwner(ownerPlayerId: string, now: number): Promise<RallyLink[]> {
    return [...this.links.values()]
      .filter((link) => link.ownerPlayerId === ownerPlayerId && rallyLinkIsActive(link, now))
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((link) => ({ ...link, anchor: { ...link.anchor } }));
  }

  async countCreatedSince(ownerPlayerId: string, since: number): Promise<number> {
    return [...this.links.values()].filter((link) => link.ownerPlayerId === ownerPlayerId && link.createdAt >= since).length;
  }

  async revoke(ownerPlayerId: string, code: string, now: number): Promise<boolean> {
    const link = this.links.get(code);
    if (!link || link.ownerPlayerId !== ownerPlayerId || link.revokedAt) return false;
    link.revokedAt = now;
    return true;
  }

  async consume(code: string, now: number): Promise<RallyLink | undefined> {
    const link = this.links.get(code);
    if (!link || !rallyLinkIsActive(link, now)) return undefined;
    link.uses += 1;
    return { ...link, anchor: { ...link.anchor } };
  }

  async releaseUse(code: string): Promise<void> {
    const link = this.links.get(code);
    if (!link) return;
    link.uses = Math.max(0, link.uses - 1);
  }
}

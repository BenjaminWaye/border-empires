// Account cosmetics (docs/gdd.md §8, launch scope item 5).
//
// Hard rule: money never buys power. A cosmetic changes only how something
// looks. It must never change visibility, hit areas, or what a rival can read
// from the thing it decorates (owner, mode, strength). Renderers must keep
// those signals exactly as readable as the default look.
//
// A slot holds at most one selected cosmetic. No selection means the default
// look, which is what every account that owns nothing sees and shows.

// Colour scheme and beacon slots are added here when their cosmetics are
// built; nothing else in the plumbing is per slot.
export const COSMETIC_SLOTS = ["musterFlag", "ancillaries"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export type CosmeticDefinition = {
  /** Stable id: stored in the database and sent on the wire. Never rename. */
  readonly id: string;
  readonly slot: CosmeticSlot;
  /** Working title shown in Settings. The owner sets the final shop name. */
  readonly label: string;
  readonly description: string;
};

export const COSMETIC_CATALOG = [
  {
    id: "flag-high-noble",
    slot: "musterFlag",
    label: "High-noble standard",
    description: "A gilded muster standard: turning aureole and halo, golden wings, flowing House streamers, glowing gems, gold-thread damask."
  },
  {
    id: "ancillaries-lancet-guard",
    slot: "ancillaries",
    label: "Lancet guard",
    description: "House ancillaries in the long coat and hooded helm of a high-noble guard: black faceplate, white sight slit, slim lancet rifle."
  }
] as const satisfies readonly CosmeticDefinition[];

export type CosmeticId = (typeof COSMETIC_CATALOG)[number]["id"];
export type MusterFlagCosmeticId = Extract<(typeof COSMETIC_CATALOG)[number], { slot: "musterFlag" }>["id"];
export type AncillariesCosmeticId = Extract<(typeof COSMETIC_CATALOG)[number], { slot: "ancillaries" }>["id"];

/** What a player shows to everyone. A missing slot means the default look. */
export type PlayerCosmeticSelection = {
  musterFlag?: MusterFlagCosmeticId;
  ancillaries?: AncillariesCosmeticId;
};

const DEFINITION_BY_ID: ReadonlyMap<string, CosmeticDefinition> = new Map(COSMETIC_CATALOG.map((entry) => [entry.id, entry]));

export const isCosmeticSlot = (value: unknown): value is CosmeticSlot =>
  typeof value === "string" && (COSMETIC_SLOTS as readonly string[]).includes(value);

export const isCosmeticId = (value: unknown): value is CosmeticId => typeof value === "string" && DEFINITION_BY_ID.has(value);

export const cosmeticDefinition = (id: string): CosmeticDefinition | undefined => DEFINITION_BY_ID.get(id);

export const cosmeticBelongsToSlot = (id: string, slot: CosmeticSlot): boolean => DEFINITION_BY_ID.get(id)?.slot === slot;

/**
 * Reads a selection from untrusted input (a wire message or a database row).
 * Unknown ids, ids in the wrong slot and unknown slots are dropped, so a
 * retired or mistyped cosmetic falls back to the default look.
 */
export const sanitizeCosmeticSelection = (value: unknown): PlayerCosmeticSelection => {
  const selection: PlayerCosmeticSelection = {};
  if (!value || typeof value !== "object") return selection;
  const record = value as Record<string, unknown>;
  for (const slot of COSMETIC_SLOTS) {
    const id = record[slot];
    if (typeof id === "string" && cosmeticBelongsToSlot(id, slot)) Object.assign(selection, { [slot]: id });
  }
  return selection;
};

export const isEmptyCosmeticSelection = (selection: PlayerCosmeticSelection): boolean =>
  COSMETIC_SLOTS.every((slot) => selection[slot] === undefined);

// What the shop sells. A product grants one or more cosmetics in one
// purchase; ownership is still stored per cosmetic, so the plumbing above
// never needs to know about products. Owner decisions, 2026-11-25: one
// product, "Claim the title of Count", USD 4.99, granting the High-noble
// standard and the Lancet guard together, and making the account a Count.
export type CosmeticProduct = {
  /** Stable id: sent by the payment provider's webhook. Never rename. */
  readonly id: string;
  /** Shop name. */
  readonly name: string;
  /** One-time price in US cents. Taxes and other currencies are the payment provider's. */
  readonly priceUsdCents: number;
  readonly grants: readonly CosmeticId[];
  /** The title an account holds while it owns everything this product grants. */
  readonly title?: AccountTitle;
};

/** Titles an account can hold. Shown before the House name on the contest
 * roster and the public House profile; never in a match, never with power. */
export const ACCOUNT_TITLES = ["Count"] as const;
export type AccountTitle = (typeof ACCOUNT_TITLES)[number];

export const isAccountTitle = (value: unknown): value is AccountTitle =>
  typeof value === "string" && (ACCOUNT_TITLES as readonly string[]).includes(value);

export const COSMETIC_PRODUCTS = [
  {
    id: "title-count",
    name: "Claim the title of Count",
    priceUsdCents: 499,
    grants: ["flag-high-noble", "ancillaries-lancet-guard"],
    title: "Count"
  }
] as const satisfies readonly CosmeticProduct[];

export type CosmeticProductId = (typeof COSMETIC_PRODUCTS)[number]["id"];

const PRODUCT_BY_ID: ReadonlyMap<string, CosmeticProduct> = new Map(COSMETIC_PRODUCTS.map((product) => [product.id, product]));

export const cosmeticProduct = (id: string): CosmeticProduct | undefined => PRODUCT_BY_ID.get(id);

/** The title an account holds: that of the first titled product whose every
 * cosmetic it owns. A revoked cosmetic (a refund) takes the title away. */
export const accountTitleFor = (owned: readonly string[]): AccountTitle | undefined => {
  const have = new Set(owned);
  const product = (COSMETIC_PRODUCTS as readonly CosmeticProduct[]).find(
    (entry) => entry.title !== undefined && entry.grants.every((id) => have.has(id))
  );
  return product?.title;
};

// Account cosmetics (docs/gdd.md §8, launch scope item 5).
//
// Hard rule: money never buys power. A cosmetic changes only how something
// looks. It must never change visibility, hit areas, or what a rival can read
// from the thing it decorates (owner, mode, strength). Renderers must keep
// those signals exactly as readable as the default look.
//
// A slot holds at most one selected cosmetic. No selection means the default
// look, which is what every account that owns nothing sees and shows.

// One slot today. Colour scheme, beacon and ancillary slots are added here
// when their cosmetics are built; nothing else in the plumbing is per slot.
export const COSMETIC_SLOTS = ["musterFlag"] as const;
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
    description: "A gilded muster standard: turning aureole, golden wings, House streamers, gold-bordered damask cloth."
  }
] as const satisfies readonly CosmeticDefinition[];

export type CosmeticId = (typeof COSMETIC_CATALOG)[number]["id"];
export type MusterFlagCosmeticId = Extract<(typeof COSMETIC_CATALOG)[number], { slot: "musterFlag" }>["id"];

/** What a player shows to everyone. A missing slot means the default look. */
export type PlayerCosmeticSelection = {
  musterFlag?: MusterFlagCosmeticId;
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

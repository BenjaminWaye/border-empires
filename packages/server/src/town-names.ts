import type { TileKey } from "@border-empires/shared";

type TownLike = {
  townId: string;
  tileKey: TileKey;
  name?: string;
};

type NameCulture = {
  id: string;
  starts: readonly string[];
  middles: readonly string[];
  ends: readonly string[];
  landmarks: readonly string[];
};

const NAME_CULTURES: readonly NameCulture[] = [
  {
    id: "brassforge",
    starts: ["Aether", "Brass", "Copper", "Cinder", "Gear", "Iron", "Rivet", "Steam"],
    middles: ["en", "er", "el", "in", "or", "um"],
    ends: ["barrow", "ford", "gate", "haven", "lock", "spire", "stead", "wick"],
    landmarks: ["Anvil", "Boiler", "Causeway", "Foundry", "Reach", "Span"]
  },
  {
    id: "elderglen",
    starts: ["Ael", "Cele", "Elen", "Fae", "Gal", "Loth", "Sil", "Thalan"],
    middles: ["dor", "len", "mir", "nor", "riel", "wen"],
    ends: ["bloom", "glen", "harbor", "mere", "rest", "spire", "vale", "watch"],
    landmarks: ["Bower", "Crossing", "Lantern", "Rise", "Sanctum", "Weald"]
  },
  {
    id: "khazmach",
    starts: ["Brom", "Durn", "Ghal", "Khaz", "Mor", "Orik", "Thram", "Varr"],
    middles: ["ak", "ar", "grim", "ok", "ul", "ur"],
    ends: ["anvil", "delve", "forge", "hall", "hold", "shaft", "vault", "works"],
    landmarks: ["Bastion", "Engine", "Pillar", "Reservoir", "Stronghold", "Trench"]
  },
  {
    id: "suncoil",
    starts: ["Azra", "Ilyr", "Mir", "Qadar", "Saff", "Sol", "Taz", "Zahir"],
    middles: ["ad", "em", "ir", "or", "un", "yr"],
    ends: ["bazaar", "cairn", "gate", "harbor", "loom", "spire", "strand", "ward"],
    landmarks: ["Caravan", "Cistern", "Mast", "Mirage", "Pavilion", "Vault"]
  },
  {
    id: "mistclock",
    starts: ["Bramble", "Copper", "Hob", "Kettle", "Merry", "Moss", "Tumble", "Willow"],
    middles: ["berry", "ettle", "fiddle", "hollow", "merry", "whistle"],
    ends: ["burrow", "corner", "croft", "market", "nook", "row", "run", "wharf"],
    landmarks: ["Bridge", "Close", "Green", "Lane", "Mill", "Pocket"]
  },
  {
    id: "stormrun",
    starts: ["Bryn", "Eira", "Hald", "Runa", "Skar", "Storm", "Tor", "Vig"],
    middles: ["ar", "en", "is", "or", "sk", "ul"],
    ends: ["brae", "coast", "fjord", "keep", "march", "reach", "roost", "wake"],
    landmarks: ["Beacon", "Moor", "Pier", "Shelf", "Skerry", "Sound"]
  },
  {
    id: "gloamgear",
    starts: ["Ash", "Gloam", "Noct", "Raven", "Sable", "Shade", "Umber", "Vel"],
    middles: ["dra", "en", "grim", "or", "ra", "yth"],
    ends: ["bastion", "clock", "hollow", "manor", "reach", "spire", "veil", "watch"],
    landmarks: ["Chapel", "Court", "Hearth", "Manse", "Quarter", "Ward"]
  },
  {
    id: "prismcoil",
    starts: ["Arc", "Auri", "Lumen", "Myth", "Prism", "Quartz", "Vesper", "Volt"],
    middles: ["el", "en", "ion", "ora", "yr", "ys"],
    ends: ["aerie", "crown", "focus", "harbor", "relay", "spire", "vault", "wake"],
    landmarks: ["Array", "Battery", "Circuit", "Lens", "Ring", "Vault"]
  }
];

const FALLBACK_LANDMARK = "Reach";

const normalizeModulo = (value: number, mod: number): number => ((value % mod) + mod) % mod;

const mixSeed = (seed: number, value: number): number => {
  const next = Math.imul(seed ^ value, 0x45d9f3b);
  return (next ^ (next >>> 16)) >>> 0;
};

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pick = <T>(items: readonly T[], seed: number): T => items[normalizeModulo(seed, items.length)]!;

const islandKeyForTile = (tileKey: TileKey, islandIdByTile: ReadonlyMap<TileKey, number>): number =>
  islandIdByTile.get(tileKey) ?? -(hashString(tileKey) + 1);

export const cultureIdForIsland = (worldSeed: number, islandId: number): string =>
  pick(NAME_CULTURES, mixSeed(worldSeed, islandId)).id;

const cultureForIsland = (worldSeed: number, islandId: number): NameCulture =>
  pick(NAME_CULTURES, mixSeed(worldSeed, islandId));

const buildCompoundName = (culture: NameCulture, seed: number, includeMiddle: boolean): string => {
  const start = pick(culture.starts, mixSeed(seed, 11));
  const middle = includeMiddle ? pick(culture.middles, mixSeed(seed, 23)) : "";
  const end = pick(culture.ends, mixSeed(seed, 37));
  return `${start}${middle}${end}`;
};

const candidateTownName = (town: TownLike, worldSeed: number, islandId: number, attempt: number): string => {
  const seed = mixSeed(mixSeed(mixSeed(worldSeed, islandId), hashString(town.tileKey)), hashString(`${town.townId}:${attempt}`));
  const culture = cultureForIsland(worldSeed, islandId);
  const form = normalizeModulo(seed, 4);
  if (form === 0) return buildCompoundName(culture, seed, false);
  if (form === 1) return buildCompoundName(culture, seed, true);
  if (form === 2) return `${buildCompoundName(culture, seed, false)} ${pick(culture.landmarks, mixSeed(seed, 53))}`;
  return `${buildCompoundName(culture, seed, true)} ${pick(culture.landmarks, mixSeed(seed, 71))}`;
};

export const assignMissingTownNames = (
  townsIterable: Iterable<TownLike>,
  islandIdByTile: ReadonlyMap<TileKey, number>,
  worldSeed: number
): void => {
  const towns = [...townsIterable];
  const usedByIsland = new Map<number, Set<string>>();
  const usedNamesForIsland = (islandId: number): Set<string> => {
    const existing = usedByIsland.get(islandId);
    if (existing) return existing;
    const created = new Set<string>();
    usedByIsland.set(islandId, created);
    return created;
  };

  for (const town of towns) {
    const islandId = islandKeyForTile(town.tileKey, islandIdByTile);
    const name = town.name?.trim();
    if (!name) continue;
    usedNamesForIsland(islandId).add(name);
  }

  const unnamedTowns = towns
    .filter((town) => !town.name?.trim())
    .sort((left, right) => left.tileKey.localeCompare(right.tileKey) || left.townId.localeCompare(right.townId));

  for (const town of unnamedTowns) {
    const islandId = islandKeyForTile(town.tileKey, islandIdByTile);
    const used = usedNamesForIsland(islandId);
    let assigned: string | undefined;
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const candidate = candidateTownName(town, worldSeed, islandId, attempt);
      if (used.has(candidate)) continue;
      assigned = candidate;
      break;
    }
    if (!assigned) {
      assigned = `${buildCompoundName(cultureForIsland(worldSeed, islandId), mixSeed(worldSeed, used.size + 1), true)} ${FALLBACK_LANDMARK} ${used.size + 1}`;
    }
    town.name = assigned;
    used.add(assigned);
  }
};

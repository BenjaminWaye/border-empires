// Structure ids were renamed to match their player-facing names (e.g.
// CARAVANARY -> TRADE_NEXUS, AETHER_TOWER -> AMBARIC_TRANSFORMER). Saved
// worlds, the event log, queued commands and clients still running an older
// bundle can carry the old spellings, so every boundary that reads such data
// passes it through upgradeLegacyStructureNames before use.
//
// This file is the only place the old names may appear. The upgrade is
// idempotent: no new name is also an old name, so data that is already
// current passes through unchanged and the upgrade is safe to run on any read.

type Rule = { readonly old: readonly string[]; readonly neu: readonly string[] };

// [old words, new words], lowercase. Plurals are listed explicitly because
// identifiers like `oldPluralByOwner` appear in persisted keys.
const RULE_TABLE: ReadonlyArray<readonly [string, string]> = [
  ["mintworks", "manufactory"],
  ["advanced umbrite synthesizer", "high yield umbrite works"],
  ["advanced umbrite synthesizers", "high yield umbrite works"],
  ["advanced titanium works", "high yield titanium works"],
  ["advanced crystal synthesizer", "high yield aether condenser"],
  ["advanced crystal synthesizers", "high yield aether condensers"],
  ["umbrite synthesizer", "umbrite works"],
  ["umbrite synthesizers", "umbrite works"],
  ["crystal synthesizer", "aether condenser"],
  ["crystal synthesizers", "aether condensers"],
  ["aether tower", "ambaric transformer"],
  ["aether towers", "ambaric transformers"],
  ["siege outpost", "siege battery"],
  ["siege outposts", "siege batteries"],
  ["farmstead", "hydrogarden"],
  ["farmsteads", "hydrogardens"],
  ["waterworks", "hydroworks"],
  ["granary", "incubation engine"],
  ["granaries", "incubation engines"],
  ["airport", "sky dock"],
  ["airports", "sky docks"],
  ["wooden fort", "palisade"],
  ["wooden forts", "palisades"],
  ["caravanary", "trade nexus"],
  ["caravanaries", "trade nexuses"],
  ["foundry", "ore refinery"],
  ["foundries", "ore refineries"],
  ["garrison hall", "ancillary depot"],
  ["garrison halls", "ancillary depots"],
  ["customs house", "harbor exchange"],
  ["customs houses", "harbor exchanges"],
  ["governors office", "ministry hall"],
  ["governors offices", "ministry halls"],
  ["radar system", "resonance grid"],
  ["radar systems", "resonance grids"],
  ["logistics guild", "ancillary factory"],
  ["logistics guilds", "ancillary factories"],
  ["assembly works", "reserve lattice"],
  ["rail depot", "neural works"],
  ["rail depots", "neural works"],
  ["world engine", "sovereign siege engine"],
  ["world engines", "sovereign siege engines"],
  ["population bureau", "census directorate"],
  ["population bureaus", "census directorates"]
];

const RULES: readonly Rule[] = RULE_TABLE.map(([old, neu]) => ({ old: old.split(" "), neu: neu.split(" ") })).sort(
  (a, b) => b.old.length - a.old.length
);

// Same words, different meaning: the Foundry Heart natural wonder, the
// "Siege Lens Foundry" AFC module and the Cogwork/War Foundries domains.
const BLOCKED_AFTER: Readonly<Record<string, ReadonlySet<string>>> = { foundry: new Set(["heart", "module"]) };
const BLOCKED_BEFORE: Readonly<Record<string, ReadonlySet<string>>> = {
  foundry: new Set(["lens"]),
  foundries: new Set(["cogwork", "war"])
};

// Tech and domain ids are not structure ids and were not renamed.
const PROTECTED_VALUES: ReadonlySet<string> = new Set(["world-engine", "urban-mintworks", "cogwork-foundries", "war-foundries"]);

// Cheap pre-filter: a string without any of these fragments cannot match.
const CANDIDATE = /mintworks|synthesizer|aether.?tower|siege.?outpost|farmstead|waterworks|granar|airport|wooden.?fort|caravanar|foundr|garrison.?hall|customs.?house|governors.?office|radar.?system|logistics.?guild|assembly.?works|rail.?depot|world.?engine|population.?bureau/i;

const ruleAt = (words: readonly string[], i: number): Rule | undefined => {
  for (const rule of RULES) {
    const n = rule.old.length;
    if (i + n > words.length) continue;
    let matches = true;
    for (let k = 0; k < n; k += 1) {
      if (words[i + k] !== rule.old[k]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const last = rule.old[n - 1]!;
    const next = words[i + n];
    const previous = words[i - 1];
    if (next !== undefined && BLOCKED_AFTER[last]?.has(next)) continue;
    if (previous !== undefined && BLOCKED_BEFORE[last]?.has(previous)) continue;
    return rule;
  }
  return undefined;
};

const mapWords = (words: readonly string[]): string[] | undefined => {
  const out: string[] = [];
  let changed = false;
  for (let i = 0; i < words.length; ) {
    const rule = ruleAt(words, i);
    if (rule) {
      out.push(...rule.neu);
      i += rule.old.length;
      changed = true;
    } else {
      out.push(words[i]!);
      i += 1;
    }
  }
  return changed ? out : undefined;
};

const capitalize = (word: string): string => (word ? word[0]!.toUpperCase() + word.slice(1) : word);

/**
 * Upgrades one identifier-shaped token (UPPER_SNAKE, lower_snake, kebab-case,
 * camelCase) to the current structure names. Anything else, including
 * PascalCase words and text with spaces, is returned unchanged so free text
 * and display strings are never rewritten.
 */
export const upgradeLegacyStructureToken = (token: string): string => {
  if (!CANDIDATE.test(token) || PROTECTED_VALUES.has(token)) return token;
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(token)) {
    return mapWords(token.toLowerCase().split("_"))?.map((w) => w.toUpperCase()).join("_") ?? token;
  }
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(token)) return mapWords(token.split("_"))?.join("_") ?? token;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(token)) return mapWords(token.split("-"))?.join("-") ?? token;
  if (/^[a-z][a-zA-Z0-9]*$/.test(token)) {
    const words = token.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|[0-9]+/g);
    if (!words || words.join("") !== token) return token;
    const mapped = mapWords(words.map((w) => w.toLowerCase()));
    return mapped ? mapped[0]! + mapped.slice(1).map(capitalize).join("") : token;
  }
  return token;
};

// Free-text fields whose values are never identifiers.
const FREE_TEXT_KEYS: ReadonlySet<string> = new Set([
  "name",
  "displayName",
  "playerName",
  "townName",
  "text",
  "message",
  "title",
  "body",
  "label",
  "note",
  "detail",
  "headline",
  "email"
]);

// Persisted state nests JSON as strings (e.g. tile economicStructureJson,
// queued command payloadJson); upgrade those too.
const upgradeEmbeddedJson = (value: string): string => {
  if (!CANDIDATE.test(value)) return value;
  try {
    return upgradeLegacyStructureNamesInJson(value);
  } catch {
    return value;
  }
};

const upgradeValue = (value: unknown, key: string | undefined): unknown => {
  if (typeof value === "string") {
    if (key !== undefined && FREE_TEXT_KEYS.has(key)) return value;
    const first = value.charCodeAt(0);
    if (first === 123 /* { */ || first === 91 /* [ */) return upgradeEmbeddedJson(value);
    return upgradeLegacyStructureToken(value);
  }
  if (Array.isArray(value)) {
    let copy: unknown[] | undefined;
    for (let i = 0; i < value.length; i += 1) {
      const next = upgradeValue(value[i], key);
      if (next !== value[i]) {
        copy ??= value.slice();
        copy[i] = next;
      }
    }
    return copy ?? value;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>);
    let changed = false;
    const next = entries.map(([entryKey, entryValue]): [string, unknown] => {
      const nextKey = upgradeLegacyStructureToken(entryKey);
      const nextValue = upgradeValue(entryValue, nextKey);
      if (nextKey !== entryKey || nextValue !== entryValue) changed = true;
      return [nextKey, nextValue];
    });
    return changed ? Object.fromEntries(next) : value;
  }
  return value;
};

/**
 * Deep-upgrades parsed JSON (plain objects, arrays, strings). Returns the same
 * reference when nothing needed upgrading.
 */
export const upgradeLegacyStructureNames = <T>(value: T): T => upgradeValue(value, undefined) as T;

/** Upgrades a JSON string, skipping the parse entirely when it can't contain an old name. */
export const upgradeLegacyStructureNamesInJson = (json: string): string => {
  if (!CANDIDATE.test(json)) return json;
  const parsed: unknown = JSON.parse(json);
  const upgraded = upgradeLegacyStructureNames(parsed);
  return upgraded === parsed ? json : JSON.stringify(upgraded);
};

/** True when a raw string could contain an old structure name (cheap pre-check). */
export const mayContainLegacyStructureNames = (raw: string): boolean => CANDIDATE.test(raw);

// Crest lettering for lists of empires. A crest is normally one capital
// letter, but two empires can share it (Alden and Astrid were both "A" on
// Ranks, told apart only by red vs green: playtest 2026-11-12). When a letter
// is shared within one list, those crests show the first two letters ("Al",
// "As") so they can be told apart without relying on colour.

const firstLetter = (name: string): string => (name.trim()[0] ?? "?").toUpperCase();

const twoLetters = (name: string): string => {
  const letters = [...name.trim()].filter((ch) => /\p{L}|\p{N}/u.test(ch));
  const first = (letters[0] ?? "?").toUpperCase();
  const second = (letters[1] ?? "").toLowerCase();
  return `${first}${second}`;
};

/** Returns the crest text for each name, given every name shown in the same list. */
export const crestLettersFor = (names: Iterable<string>): ((name: string) => string) => {
  const namesByLetter = new Map<string, Set<string>>();
  for (const name of names) {
    const key = firstLetter(name);
    const set = namesByLetter.get(key) ?? new Set<string>();
    set.add(name.trim().toLowerCase());
    namesByLetter.set(key, set);
  }
  return (name) => ((namesByLetter.get(firstLetter(name))?.size ?? 0) > 1 ? twoLetters(name) : firstLetter(name));
};

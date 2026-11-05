// Details ▾ shows the tile overview minus what the fact strip already says
// ("Built: Relay Beacon" under Building, a modifier line under Gives), and
// drops any heading left with nothing under it.

import type { TileMenuView } from "../client-types.js";
import { plainText, type TileFact } from "./client-hud-v2-tile-facts.js";

type OverviewLine = TileMenuView["overviewLines"][number];

const norm = (text: string): string => text.toLowerCase().replace(/[^a-z0-9+%-]+/g, " ").trim();

/** Everything the strip says, as normalised phrases: each value (and each part of a " · " list), with and without its label. */
const factPhrases = (facts: readonly TileFact[]): Set<string> => {
  const phrases = new Set<string>();
  for (const fact of facts) {
    for (const value of [fact.value, ...fact.value.split(" · ")]) {
      phrases.add(norm(value));
      phrases.add(norm(`${fact.label} ${value}`));
    }
  }
  phrases.delete("");
  return phrases;
};

const isHeading = (line: OverviewLine): boolean => line.kind === "section" || line.kind === "group";

const repeatsFact = (line: OverviewLine, phrases: ReadonlySet<string>): boolean => {
  const text = plainText(line.html);
  if (phrases.has(norm(text))) return true;
  // "Built: Relay Beacon" repeats the Building fact by its value alone; a bare number ("Garrison: 2") says nothing on its own.
  const split = text.indexOf(": ");
  const value = split > 0 ? norm(text.slice(split + 2)) : "";
  return /[a-z]/.test(value) && phrases.has(value);
};

export const detailLinesBeyondFacts = (lines: readonly OverviewLine[], facts: readonly TileFact[]): OverviewLine[] => {
  const phrases = factPhrases(facts);
  const kept = lines.filter((l) => l.kind === "loading" || isHeading(l) || l.kind === "statgrid" || !repeatsFact(l, phrases));
  // Walk back up so each heading knows whether anything survived beneath it.
  const out: OverviewLine[] = [];
  let underSection = false;
  let underGroup = false;
  for (const line of [...kept].reverse()) {
    if (line.kind === "section") {
      if (underSection) out.push(line);
      underSection = false;
      underGroup = false;
    } else if (line.kind === "group") {
      if (underGroup) {
        out.push(line);
        underSection = true;
      }
      underGroup = false;
    } else {
      out.push(line);
      if (line.kind !== "loading") underSection = true;
      underGroup = Boolean(line.nested);
    }
  }
  return out.reverse();
};

// House crests: the charge drawn on a House's emblem in place of its initial
// (owner decision 2026-11-27, docs/cosmetics.md "House crests"). The emblem's
// field stays the House colour, so a crest never hides who a House is.
//
// Every crest here is free for now. `free: true` means every account owns it
// without a grant; a later paid crest leaves `free` off and is granted like
// any other cosmetic. Ids are stored and sent on the wire: never rename one.
//
// No crown: a crown would read as the earned Duke title.

export const CREST_COSMETICS = [
  { id: "crest-cog", slot: "crest", free: true, label: "Cog", description: "A House cog." },
  { id: "crest-anchor", slot: "crest", free: true, label: "Anchor", description: "A ship's anchor." },
  { id: "crest-tower", slot: "crest", free: true, label: "Tower", description: "A battlemented tower." },
  { id: "crest-lighthouse", slot: "crest", free: true, label: "Lighthouse", description: "A lighthouse casting its beams." },
  { id: "crest-airship", slot: "crest", free: true, label: "Airship", description: "An airship under way." },
  { id: "crest-spanners", slot: "crest", free: true, label: "Spanners", description: "Two spanners crossed." },
  { id: "crest-gear-wing", slot: "crest", free: true, label: "Gear-wing", description: "A cog with one wing." },
  { id: "crest-key", slot: "crest", free: true, label: "Key", description: "A great key." },
  { id: "crest-compass", slot: "crest", free: true, label: "Compass", description: "A compass star." },
  { id: "crest-kraken", slot: "crest", free: true, label: "Kraken", description: "A kraken rising." },
  { id: "crest-stag", slot: "crest", free: true, label: "Stag", description: "A stag's head." },
  { id: "crest-hammer", slot: "crest", free: true, label: "Hammer", description: "A forge hammer." }
] as const;

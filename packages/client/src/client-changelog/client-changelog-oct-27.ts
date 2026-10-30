import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_OCT_27: ClientChangelogEntry[] = [
  {
    createdAt: 1793084624260, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.1",
    title: "Cleaner coastlines",
    why: "The new curved beaches had a few rough edges: faint dashed lines in territory along the old square coast, small inlets and lakes filling with sand, and occasional straight sand edges.",
    changes: [
      "No more faint dashed lines inside territory along the old square coastline",
      "Narrow inlets, dead-end bays and one-tile lakes keep open water",
      "Beach edges no longer jump into straight, grid-aligned steps",
      "Territory colour on narrow beaches fades smoothly from the land instead of starting part-faded",
      "Coastlines rebuild about twice as fast while panning"
    ]
  },
  {
    createdAt: 1793119941423, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.2",
    title: "A more detailed Fabrication Complex",
    why: "The House’s industrial seed should look like substantial, precision-built machinery.",
    changes: ["The 3D AFC now has beveled metalwork, brushed surfaces, reactor containment rings, cooling channels, detailed docking hardware and restrained cyan status lights. Its angular legs have layered titanium-coloured armour, offset actuators, illuminated knee rings and grounded stabilizer feet.", "The 2D fallback gains eight service bays, radial braces and brass fasteners. Module positions and gameplay are unchanged."]
  },
  {
    createdAt: 1793127173514, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.3",
    title: "AI empires start on the same ground as players",
    why: "AI empires used to pick their starting spots with a separate search, so one could start right beside a good opening that a player would later join on, then grow into it.",
    changes: [
      "From next season, AI empires start on the same kind of good sites players join on, each taking the open site farthest from the empires already placed.",
      "Players who join later pick from the good sites no AI has taken.",
      "AI empires only fall back to their old search if every good site is taken."
    ]
  },
  {
    createdAt: 1793132797501, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.4",
    title: "Coin and Shard sliders in diplomacy",
    why: "Setting a deal's terms meant typing into four bare number boxes.",
    changes: [
      "\"You give\" and \"You ask\" now show Coin and Shards as tiles. Press one to open a slider that runs from 0 to what that side holds, with a box beside it for typing an exact amount.",
      "When asking an AI for coin or Shards, the slider stops at what it can actually pay."
    ]
  },
  {
    createdAt: 1793125924000, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.5",
    title: "Clearer economy resources",
    why: "Unresearched resources cluttered the bar, and slot sources showed as a vague \"Other bonuses\".",
    changes: ["Crystal, Titanium and Umbrite stay off the resource bar and Economy panel until researched, unless you already have slots or users for them.", "Economy slot sources now list every source by name: resource sites, Mines and Refineries, upgrades, Waystations, Siphons, Foundry Heart and relics.", "Slot sources now cover your whole empire, not just the area on screen."]
  },
  {
    createdAt: 1793136357667, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.6",
    title: "Extend a running truce",
    why: "A truce offer to an empire you already had a truce with was refused, so a truce could only lapse and be renegotiated.",
    changes: [
      "While a truce is running, the deal screen offers Extend 12h or Extend 24h. Once accepted, the hours are added to the current truce, which can run at most 48h ahead. Extending a Court armistice makes it an ordinary truce.",
      "AI empires price an extension like a new truce of that length, recent truces included, but never pay you for one."
    ]
  },
  {
    createdAt: 1793140036460, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.7",
    title: "Town surveys remember your dismissal",
    why: "The same survey popup could return every time you reopened the game.",
    changes: ["Got it and View survey now remember dismissed clues in this browser for your player and season. Clues remain in Activity, and new discoveries can still appear."]
  },
  {
    createdAt: 1793140139293, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.8",
    title: "Manpower batch amounts",
    why: "Manpower arrives in batches, so per-minute labels made building output hard to judge.",
    changes: ["The manpower countdown shows +N in the remaining time, including on mobile.", "Town upgrades, manpower buildings and regeneration modifiers show their output per batch."]
  }
];

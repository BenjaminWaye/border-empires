import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_87: ClientChangelogEntry[] = [
  {
    createdAt: 1789417055105, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.03",
    title: "Waystation activation popup now has hero art",
    why: "The Waystation activation reward popup was plain text on a dark panel -- eyebrow label, coordinates, one line of copy -- despite its own PR description claiming it was visually modeled on the Town Captured popup, which has a hand-illustrated skyline hero. That gap was easy to miss because nothing in the code or the popup itself called it out.",
    changes: [
      "Activating a Waystation now shows a hero illustration of the frontier rig (mast, glowing lens, roofed shelter, crates) above the reward text, matching the Town Captured popup's visual treatment",
      "The reward copy now reads as a narrative sentence (e.g. naming the actual town a Population burst moved into) followed by a bold \"Modifiers\" line with the concrete effect",
      "The Population reward now offers a \"Jump to Town\" button, and the Tech reward's \"Unlocked: <name>\" line is now clickable and opens that tech's detail panel"
    ]
  },
  {
    createdAt: 1789417055104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.08",
    title: "Siege Tower and Dread Tower beams open the fight by taking out a defender",
    why: "The siege tower's aether lens already swung to track and beam an ongoing battle, but the beam never appeared to do anything -- marines fell purely on their own combat-resolved schedule with no visual link to the tower supposedly firing on them. This ties the two together: when a real Siege Tower or Dread Tower is beaming a tile, the beam now strikes down a defender right as combat starts, opening the fight.",
    changes: [
      "While a Siege Tower or Dread Tower is beaming a battle, its lance now strikes an actual defending unit combat resolution already scheduled to fall, right as the fight begins -- this attributes an existing casualty to the tower and moves only that one unit's own visual death timing up to the start of the fight; it never changes who wins, who dies, or the units' own combat rolls",
      "No change when no siege tower is present, or when the tower is aimed at a different battle -- the beam stays purely decorative in that case, as before"
    ]
  },
  {
    createdAt: 1789417055103, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Battles open with a blue-violet opening strike",
    why: "A squad's approach march used to lead straight into the firefight with no beat marking the transition, so combat felt like it just started rather than being kicked off by anything. A single lance now drops onto the tile right as the approach ends, giving the clash a clear opening shot before the marines' own empire-colored bolts take over.",
    changes: [
      "A blue-violet lance now strikes down onto a battle tile in the last moment before a squad's firefight begins, landing right as combat commences",
      "This opening strike is separate from the empire-colored bolts marines trade during the fight itself -- it's a one-time cosmetic beat, not a new combat mechanic"
    ]
  },
  {
    createdAt: 1789417055102, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.06",
    title: "Siege towers rise as towering aether artillery",
    why: "The upgraded siege variants (Siege Tower and its Dread Tower successor) shared the Siege Battery's compact carriage, so a max-tier siege engine looked like a planted cannon instead of the looming war machine its stats describe. They're now distinct towers: a heavy black-iron lattice braced on stabilizer legs, one enormous glowing aether lens in a brass gimbal, and a cyan-violet beam that swings down at the latest ongoing battle.",
    changes: [
      "Siege Tower and Dread Tower now render as tall black-iron towers with a huge glowing aether lens instead of the Siege Battery's low cannon carriage",
      "Each tower's lens swings to track the most recently started ongoing battle, firing a beam that fades in while the fight is live and dims the moment it ends",
      "New \"Siege Tower Aim\" setting in the Gameplay settings lets you choose between aiming just the aether lens or rotating the whole tower toward the battle"
    ]
  },
  {
    createdAt: 1789417055101, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.02",
    title: "Waystations now grant one random reward instead of all four at once",
    why: "Activating a Waystation granted every one of its four effects (map reveal, population burst, free tech, resource slot) simultaneously, every time -- a guaranteed grab-bag rather than a reward with any variance. Waystations are common enough (~1 per 400 tiles) that this made each activation feel like a checklist instead of a discovery.",
    changes: [
      "Expanding onto a Waystation now grants exactly ONE of the four rewards, chosen at random, instead of all four at once",
      "The map-reveal reward now centers on the nearest town within range (any owner) instead of the Waystation's own tile, so it points you at something worth knowing about -- falls back to revealing around the Waystation itself if no town is nearby",
      "The free-tech reward now grants a random tier-1 tech you don't already own, instead of always granting the same fixed tech",
      "The resource-slot reward now adds its +1 slot to whichever of Food/Titanium/Crystal/Umbrite your empire currently has the fewest slots of, instead of bumping all four at once",
      "A new popup now shows exactly which reward you received when you activate a Waystation"
    ]
  },
  {
    createdAt: 1789417055100, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.01",
    title: "Fixed a false-positive fatal-error screen on some map tile clicks",
    why: "Clicking between location tiles quickly could interrupt the location's one-shot sound effect mid-play, which browsers report as a harmless rejected play() promise. That rejection wasn't caught, so it tripped the app's global error guard and showed the full-screen \"Border Empires hit a problem loading\" reload overlay even though nothing was actually broken.",
    changes: [
      "A rapid location-tile theme change no longer triggers the fatal \"hit a problem loading\" reload screen"
    ]
  }
];

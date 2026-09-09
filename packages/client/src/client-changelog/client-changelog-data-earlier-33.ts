// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_33: ClientChangelogEntry[] = [
  {
    createdAt: 1788469608148, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Fixed two hovering map badges that stopped appearing: town upgrade-ready and Aether Tower cooldown",
    why: "The town's upgrade-ready badge was computed correctly by the simulation but stripped out before reaching any client by a snapshot field allowlist, so it never showed for anyone, including the town's own owner. Separately, the Aether Tower's crystal-cooldown badge was still being added to the scene every frame, but the badge's float height was never raised when the Aether Tower got its full 3D model, so the badge ended up floating inside the tower's own solid geometry and was invisible even though the paused countdown in the tile overview was correct the whole time.",
    changes: [
      "The town upgrade-ready badge now correctly appears over any of your towns eligible to upgrade to the next population tier.",
      "The Aether Tower's recharging badge now floats above the tower instead of inside it, so it's visible again while the tower is on cooldown."
    ]
  },
  {
    createdAt: 1788468575080, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.5",
    title: "Fort no longer blocks building an Aether Tower on the same tile",
    why: "A Fort was rejecting every other structure build on its tile except a Relay Beacon, including the Aether Tower (Observatory) -- but a Fort and a Siege Outpost are the only structures that genuinely can't share a tile field. Aether Tower belongs on its own tile field and has no real conflict with a Fort.",
    changes: [
      "You can now build an Aether Tower on a tile that already has a Fort. A Siege Outpost still can't be built on a Fort tile."
    ]
  },
  {
    createdAt: 1788465026903, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.01",
    title: "Aether Towers can now be switched off and back on, like any other structure",
    why: "Every Aether Tower you own occupies CRYSTAL slots, and progressively more of them per tower -- the 1st costs 1 slot, the 2nd costs 2, and so on. Economic structures have always had an Enable/Disable switch for exactly this situation, but the tower had none: the only way to stop paying its CRYSTAL bill was to demolish it and lose the build cost. The tile menu's Disable button simply wasn't there for towers.",
    changes: [
      "An owned, finished Aether Tower now has Disable / Enable actions in its tile menu",
      "A disabled tower stops occupying CRYSTAL slots, stops giving its vision bonus, and stops powering crystal abilities and Sky Docks -- the tower itself stays built and can be switched back on at any time",
      "Disabling a tower also frees the progressive CRYSTAL rank behind it, so your remaining towers get cheaper, not just fewer"
    ]
  },
];

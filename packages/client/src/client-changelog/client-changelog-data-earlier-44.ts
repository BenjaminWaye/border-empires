// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_44: ClientChangelogEntry[] = [
  {
    createdAt: 1788814731427, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.09",
    title: "Fleets in flight are now visible in Space View's 3D scene",
    why: "Sending a fleet was invisible outside the Fleets panel -- the 3D galaxy scene had no idea a raid or recon mission was even underway. Nothing showed a fleet leaving your territory, traveling, or approaching its target.",
    changes: [
      "Each hull class (Scout, Raider, Battleline, Dreadnought, Tanker) now has its own distinct 3D ship model -- a small nosecone for Scout, a dart-shaped Raider, a plain Battleline hull, a larger spiked Dreadnought, and a tanker-shaped logistics hull for Tanker",
      "While your fleet is TRAVELING, its ships now fly a straight line from your territory to the target in the 3D scene, oriented to face the direction of travel, and land exactly when the order actually resolves server-side",
      "A fleet with a mixed composition shows one ship model per hull class present, arranged in a small formation, rather than a single generic marker",
      "New optional originSeasonId field on GET /hq/galaxy/fleets orders (your own first held territory at send time) purely powers this visual -- existing callers are unaffected, and a fleet from a player who holds no territory still gets a deterministic (if anonymous) launch point rather than being skipped",
      "This only shows your own fleets today -- there's no detection/visibility model yet for seeing an enemy fleet en route to your own territory"
    ]
  },
  {
    createdAt: 1788813121920, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.08",
    title: "Fleets panel redesign: hull cards, a live cost/damage/travel-time summary, and combat-report battle log entries",
    why: "Sending a fleet meant staring at five bare number inputs with no feedback on what you were building -- no visible cost, no damage estimate, no sense of how long the trip would take until you hit send. The battle log and fleet list were just plain text rows with no way to tell a recon ping apart from a raid at a glance.",
    changes: [
      "Each hull class is now a clickable card (icon, Production cost, damage, speed) with a +/- stepper instead of a bare number input, highlighting once you've added at least one",
      "A live summary above the Send Fleet button shows total Production cost, total damage (or \"Recon only\" for an all-Scout composition), and estimated travel time as you build the composition",
      "Your fleets list now shows a rocket/magnifying-glass/crossed-swords icon per order and an \"arrives ~Xh\" countdown while traveling, plus a status pill instead of plain text",
      "The battle log now renders each entry as a small combat-report card (attacker -> defender, an icon distinguishing a recon ping from a raid, and the damage/Stability outcome) instead of a plain text row"
    ]
  },
  {
    createdAt: 1788811800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.07",
    title: "Senate proposals now show a live quorum bar instead of just PENDING/PASSED/FAILED",
    why: "The Senate panel gave no sense of stakes while a vote was live -- a proposal just sat there labeled PENDING with a Vote button, no visible tally, no idea how close it was to passing or when it would resolve. Casting a vote felt like clicking into a void.",
    changes: [
      "Each pending proposal now shows an animated progress bar for its cast Dominion weight against the quorum it needs to clear, with a tick mark at the quorum threshold and a distinct-voters count (e.g. \"2/3 voters\")",
      "The bar turns green once both the quorum and distinct-voter floor are cleared",
      "Each proposal shows roughly when it resolves (e.g. \"resolves ~3h\")",
      "Raising a proposal now picks EMBARGO or CONTEST from two clickable cards showing their icon, Influence cost, and effect, instead of a bare dropdown",
      "New GET /hq/galaxy/senate fields (castWeight, totalWeight, quorumPct, distinctVoters, minDistinctVoters, resolvesAt) power this -- purely additive, existing callers are unaffected"
    ]
  },
];

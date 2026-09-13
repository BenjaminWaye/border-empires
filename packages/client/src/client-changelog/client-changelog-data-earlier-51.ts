// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_51: ClientChangelogEntry[] = [
  {
    createdAt: 1788904106588, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.05",
    title: "Fixed: Space View's Senate/Fleets/Settings tabs stacked instead of replacing each other",
    why: "Player-reported: clicking a different top-right tab in Space View while one was already open didn't close the previous one -- each of the three toggle buttons only ever flipped its own panel's visibility, with no idea the other two existed, so opening Fleets while Senate was open just stacked Fleets on top of it instead of replacing it.",
    changes: [
      "Opening the Senate, Fleets, or Settings tab in Space View now closes whichever of the other two was already open, so only one panel is ever visible at a time",
      "Clicking a tab's own button while it's already open still just closes it, unchanged"
    ]
  },
  {
    createdAt: 1788902995508, // frozen, 2ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.4",
    title: "Removed the Shard storage cap",
    why: "Shard was capped at just 3 in storage, one of the tightest caps in the game. With Wonder parts now also costing Shard on top of the finished Wonder, that cap meant Shard collected faster than it could be spent was wasted overflow instead of banked for the next build.",
    changes: [
      "Shard no longer has a storage cap -- collect and stockpile as much as you can gather"
    ]
  },
  {
    createdAt: 1788902995507, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.3.5",
    title: "Wonder parts now cost Shard, not just the finished Wonder",
    why: "Each Wonder's 3 prerequisite parts only ever cost manpower to build, with the Shard cost only charged on the final assembly. That let a player stockpile every part for free and made the Shard gate trivially easy to clear at the very end.",
    changes: [
      "Every Wonder part building now also costs 1 Shard to build, on top of its existing manpower cost",
      "A completed Wonder now consumes 5 Shard total across its build chain (3 for the parts, 2 for the final assembly), up from 2"
    ]
  },
  {
    createdAt: 1788902995506, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.03",
    title: "Fleets now take real build time, can hold at home as a garrison, and the Senate/Fleets target pickers say what they're for",
    why: "Player feedback: a Dreadnought costs 500 Production against a Planet's 6-8/Cycle trickle, but a fleet departed the instant it was paid for -- there was no way to just build a fleet and keep it at home, the unlabeled ⚡ speed stat next to damage read as an unexplained \"electricity\" icon, and the Senate panel's unlabeled target dropdown below the two proposal cards had no indication of what it picked.",
    changes: [
      "Sending a fleet now takes real build time (3 minutes per point of Production cost) before it actually departs -- the fleet panel shows a BUILDING status with a \"departs in ~Xh\" countdown, then TRAVELING once it's underway; the composition summary now shows a Build time alongside Cost/Damage/Travel",
      "The fleet target picker now has a \"Hold at home (garrison, no combat)\" group listing your own territories -- sending there creates a standing garrison fleet with no raid resolution, battle log entry, or Stability effect, shown with a house icon and a \"(home)\" label",
      "Each hull card's stat row now reads \"80 cost / 50 dmg / 4 spd\" instead of bare icons+numbers, so the ⚡ speed stat can't be misread as unrelated to the damage number next to it",
      "Both the Fleets and Senate target dropdowns now have a \"Target\" label and a disabled \"Choose a target...\" placeholder instead of silently defaulting to whichever option happened to load first",
      "New optional departsAt/orderKind fields on GET /hq/galaxy/fleets orders power this -- purely additive, existing callers are unaffected"
    ]
  },
  {
    createdAt: 1788876273396, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.02",
    title: "Hints and the new-player checklist now stay dismissed for good, and you can turn them off",
    why: "Discovery tips and the onboarding checklist only remembered what you'd dismissed in this browser's local storage, so clearing browser data or logging in on a different device made them reappear as if you'd never seen them.",
    changes: [
      "Dismissed discovery tips, the discovery-tip mute, and onboarding checklist completion are now saved on your account (server-side) instead of only in this browser, so they stay dismissed across devices and browser data clears",
      "Added a \"Show Hints\" checkbox under Settings > Gameplay to turn discovery tips off entirely"
    ]
  }
];

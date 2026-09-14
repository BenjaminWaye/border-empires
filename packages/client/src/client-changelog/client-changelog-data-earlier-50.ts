// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_50: ClientChangelogEntry[] = [
  {
    createdAt: 1789149360441, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.03",
    title: "3D battles now show real animated soldiers holding a spread-out firing line and trading laser fire, with sparks where shots land",
    why: "The 3D battle overlay's marines were hand-posed by procedural bone math on a placeholder skeleton, and every soldier rendered as one flat block of team colour. They're replaced with a real 24-bone rig playing real captured animation clips (running, standing/kneeling aim, and a walk cycle for the muster-transit march), and the model now has real shaded kit -- armour plates, under-suit, helmet, gloves and boots all read separately, still tinted by the team colour so a squad stays instantly readable as blue or red. A fired shot now also throws a laser bolt that lands on a specific enemy soldier and leaves a brief spark burst there, instead of only a muzzle flash with nothing visibly travelling between the two sides. Squads are 7-a-side (matching the muster-transit march company size), spread out with much more room between soldiers, and each halts at its own distance from the enemy rather than dressing one line -- fixing a bug where the outermost soldiers on each end of the line silently overlapped once the squad grew past its original size. Soldiers also no longer duck into cover and pop up around every shot (they hold a real firing stance), no longer play a running animation while standing still, no longer hover side-to-side while waiting to advance, and no longer collapse into a single pile the instant the advance begins. Like the rest of this animation, every bolt and spark is computed purely from the current battle time, so scrubbing or rejoining a siege mid-fight shows exactly the same shots in the same places rather than replaying a stateful particle emitter. The muster-transit march (client-map-3d-muster-transit-overlay.ts) now renders the same real soldier models jogging the route, in place of the plain marching dots it used before. True-3D renderer only -- the 2D canvas renderer has never had this battle animation (it shows its own pulsing 'incoming attack' tile overlay instead), which is an existing documented scope decision, not a new gap.",
    changes: [
      "3D battle soldiers are now a real animated 24-bone model with real captured running/aiming/kneeling clips, instead of hand-posed procedural bone math on a placeholder skeleton",
      "Soldiers now have visible kit -- armour plates, a darker under-suit, helmet, gloves and boots all read separately instead of the whole soldier being one flat block of team colour",
      "A fired shot now throws a laser bolt that travels to a specific enemy soldier and leaves a brief spark burst where it lands, instead of just a muzzle flash with nothing visibly crossing between the sides",
      "Bolts stop at their target instead of shooting through it, and a soldier that has been killed stops firing",
      "Squads in a 3D battle are now 7-a-side (matching the muster-transit march company size) instead of 4, with much more spacing between soldiers and each halting at its own distance from the enemy",
      "Fixed the outermost soldiers on each end of the firing line silently overlapping instead of spacing out once the squad grew past its original size",
      "Soldiers no longer duck into cover and pop back up between every shot -- they run in, halt, and hold a real firing stance, with some of the squad kneeling and the rest standing",
      "Soldiers no longer play the running animation while they are standing still, no longer drift side-to-side while waiting to advance, and no longer collapse into a single pile the instant the advance begins",
      "A muster flag's march to its target now shows the same soldier models jogging the real route, instead of a formation of plain marching dots"
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
  },
];

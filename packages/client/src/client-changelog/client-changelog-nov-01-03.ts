import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_NOV_01_03: ClientChangelogEntry[] = [
  {
    createdAt: 1793565464215, // Date.now() captured once for this entry.
    introducedIn: "2026.11.01",
    title: "Towns in the new HUD",
    why: "The new HUD had no way to reach the town list.",
    changes: ["A Towns button next to Manifest lists your towns, sortable by gold, population or growth", "Press a town to open its town screen"]
  },
  {
    createdAt: 1793605577111, // Date.now() captured when this entry was written.
    introducedIn: "2026.11.02",
    title: "Queued garrisons wait for manpower",
    why: "A queued garrison that came up while your manpower pool was short was dropped from the queue instead of waiting.",
    changes: [
      "Garrisoning without enough manpower now queues the garrison instead of refusing it",
      "A queued garrison waits for the next manpower batch, reserves its manpower, then starts on its own, even while you're offline",
      "Its queue card shows \"Needs manpower\" while it waits",
      "Builds queued behind a waiting garrison no longer wait with it"
    ]
  },
  {
    createdAt: 1793655195560, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "A guide that doesn't block the map",
    why: "New players asked for a tutorial again after the old intro slides were removed, but those slides covered the map.",
    changes: [
      "New accounts get a small guide card in the bottom-left corner that walks through the basics one step at a time: looking around, your first town and food, manpower, commissioning a Manifest, building, muster flags and the Activity dashboard",
      "Each step ticks off when you actually do it, in any order. The map stays free to pan and zoom the whole time",
      "Map targets are ringed on the map and Show me centres the camera on them; buttons you need to press get a glowing outline",
      "Skip any step, minimise the card, or hide the guide. Settings > Restart guide brings it back",
      "Existing accounts keep the New empire checklist"
    ]
  },
  {
    createdAt: 1793689184318, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "AIs name their tribute for an alliance",
    why: "Suggest deal had nothing to offer for an alliance with an AI that wasn't yet Pleased with you: it just refused, so you couldn't see what it would take.",
    changes: [
      "An AI that isn't Pleased with you yet, but could be won over with payments, now names a tribute for an alliance instead of refusing",
      "Suggest deal fills that tribute in, and the screen says how it splits: the coin that wins the AI over, plus its usual alliance price",
      "Proposing an alliance without enough tribute gets a counter-offer asking for it, if you can afford it",
      "AIs still refuse outright after recent fighting, a broken truce, when you have hurt them too much for payments to win them over, or when they wouldn't lead the alliance",
      "AIs only propose alliances themselves when they are already Pleased with you"
    ]
  },
  {
    createdAt: 1793743078716, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Manpower orb shows the size of your next batch",
    why: "The new HUD's manpower orb only showed a countdown, so you couldn't tell how much manpower was coming.",
    changes: [
      "The manpower orb now reads \"+N in 45m\": how much your next batch adds and when it lands",
      "It says \"paused\" when no manpower is coming, and \"next batch\" instead of \"refill\"",
      "The orb and the manpower chip stop showing a batch amount that has already landed"
    ]
  }
];

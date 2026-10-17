import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_RECENT: ClientChangelogEntry[] = [
  {
    createdAt: 1791144005000, // frozen at the commit that added this entry (a live Date.now() makes What's New reopen on every load)
    introducedIn: "2026.10.03.1",
    title: "AI empires can extend a full border again",
    why: "An AI could sometimes stop growing after filling its current reach, even with the gold and manpower to build a Relay Beacon.",
    changes: [
      "AI empires now also consider ordinary settled edge tiles when choosing where to build Relay Beacons"
    ]
  },
  {
    createdAt: 1790764192672, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.5",
    title: "Guest \"Save your empire\" badge no longer jumps when pressed",
    why: "Pressing the gold guest badge at the bottom of the map shifted it to the left while the button was held down.",
    changes: [
      "The badge now stays centred while you press it"
    ]
  },
  {
    createdAt: 1790768118179,
    introducedIn: "2026.09.30.5",
    title: "Choose what settles for you",
    why: "New empires used to spend their starting manpower settling nearby towns and farms automatically, before you had any say.",
    changes: [
      "You are now asked whenever towns, food or resources come within reach and aren't set to auto-settle: pick how many to settle and see the manpower cost first, or close it and carry on",
      "Auto-settle is now a per-category setting (towns & docks, food, other resources) in Settings > Gameplay, and stays on for existing players"
    ]
  },
  {
    createdAt: 1790764591773, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.4",
    title: "Slow server replies no longer strand an expansion",
    why: "When the server took more than 2 seconds to confirm an expansion, a late confirmation was thrown away and the tile stayed stuck on \"Expansion sync delayed\".",
    changes: [
      "A late expansion confirmation that arrives within 12 seconds is now picked up instead of ignored, so the claim completes normally"
    ]
  },
  {
    createdAt: 1792074933086, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "See which land Aether Towers protect",
    why: "There was no way to tell which enemy tiles were shielded from your Aether abilities, or which of your own tiles your towers were covering, without trying a cast.",
    changes: [
      "Selecting any Aether Tower, opening the Crystal (Aether abilities) tab in the tile menu, or aiming an Aether ability now tints every tile an Aether Tower is protecting right now: blue for your own and allied towers, red for enemy towers",
      "Only the tower owner's own tiles within 20 tiles are tinted, and towers on cooldown or unpowered are left out, matching what actually blocks a cast",
      "Enemy towers hidden in fog still tint the land of theirs you can see, and an enemy tower that is unpowered is correctly left out",
      "Aether ability targets grey out on exactly the tiles tinted red",
      "Works on both the 3D and 2D maps"
    ]
  },
  {
    createdAt: 1792108265294, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Siphon land while its Aether Tower is down",
    why: "Siphon was blocked by an enemy Aether Tower even while that tower was on cooldown, unlike every other Aether ability.",
    changes: [
      "You can now Siphon land whose Aether Tower is on cooldown or unpowered",
      "The siphon ends on its own as soon as that tower is back online (off cooldown and powered)",
      "Siphon the victim's CRYSTAL and their tower stays unpowered: they have to win the tile back, find CRYSTAL elsewhere, or take out your siphoning tower"
    ]
  },
  {
    createdAt: 1792204433519, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.1",
    title: "Aether Tower shields are easier to read",
    why: "Selecting an Aether Tower tinted enemy land red, which just looked like their territory going dark, with nothing saying it was a shield or where it ended.",
    changes: [
      "Shielded tiles now glow (blue for your and allied towers, red for enemy towers) instead of being shaded, and a solid outline marks where each shield ends, on both the 3D and 2D maps",
      "Selecting an Aether Tower explains the colours in the tile menu, and selecting a shielded enemy tile says which tower is shielding it",
      "The shield field only shows while aiming abilities a shield actually blocks (Siphon, Aether EMP, Aether Bridge), and Aether Bridge no longer offers landings on shielded enemy coast"
    ]
  }
];

import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUD_V2_PREVIEW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792967953137, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "New desktop HUD preview (opt-in)",
    why: "The whole interface is being redesigned; this preview is opt-in so it can be tried without replacing the current HUD.",
    changes: [
      "Add ?hud=v2 to the game URL on desktop to try it, and ?hud=legacy to switch back.",
      "Map: one resource bar with settings, your crest and screen buttons under it, a tracker on the left, truces and allies top-right, the minimap bottom-left (with a Diplomacy toggle that tints other empires' land as ally, truce or no agreement) and manpower as an orb. Selecting a tile shows its main actions at the bottom; neutral land next to yours is claimed on the click.",
      "Selecting your town or a tile around it opens the town screen with its build list. Attacking a garrisoned tile opens the battle screen with both sides' strength and your odds, then follows the fight.",
      "New Manifest tree, Diplomacy, Ranks race and Chronicle screens. Esc goes back; with nothing open it opens Settings."
    ]
  },
  {
    createdAt: 1793042494163, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "HUD preview fixes",
    why: "Fixes from the first round of testing the opt-in ?hud=v2 preview.",
    changes: [
      "The new HUD no longer shows over the loading and join screens.",
      "Manifest: techs you can research but can't afford show as available, not locked. Card text is larger and easier to read.",
      "AFC upgrades fill the screen. Clicking a resource in the top bar opens its breakdown.",
      "Your own tiles show Relay Beacon first, then Raise flag and Build ▸, which opens a build list at the side. Other actions such as Garrison sit in a row of small buttons below, not in a hidden menu.",
      "Selecting a waystation shows the bonus it gives straight away."
    ]
  },
  {
    createdAt: 1793045263832, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "HUD preview: tile facts, dev slots and more fixes",
    why: "Fixes from the second round of testing the opt-in ?hud=v2 preview.",
    changes: [
      "Selecting a tile shows a short strip of facts: a building's state, what it gives and its upkeep; a dock's coin and links; a town's tier, coin, food and growth; a wonder's name and boon; your odds against an enemy tile.",
      "Details ▾ in the tile panel opens the full tile overview in place.",
      "Development slots are always shown in the tracker. Frontier expansion shows as Expanding, not Battle.",
      "Resource, town and dock tiles lead with Garrison. Empires you've only met show by name and in their map colour.",
      "The town screen shows growth rate and stays open when you use its build list; a town still being garrisoned no longer shows NaN.",
      "Sending a truce or alliance offer confirms it, and the reply shows above the open screen.",
      "Chronicle now holds Yours, World and Updates (release notes) tabs and replaces the old Activity dashboard; its badge counts new activity and unread updates.",
      "Ranks race tracks show the top three on each path, plus you.",
      "Pressing a building or ability in the Manifest opens its info card. Settings opens in the middle of the screen over a dimmed map. Player profiles open as a full screen like the Manifest, and screens hide the crest so their Map / Esc button stays visible."
    ]
  },
  {
    createdAt: 1793054112160, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.2",
    title: "HUD preview: profiles, Updates and the Diplomacy view",
    why: "Fixes from the third round of testing the opt-in ?hud=v2 preview.",
    changes: [
      "Player profiles are a full screen: crest, standing and rank beside this season's numbers, career, trophies, holdings and pacts. Closing one goes back to the screen it was opened from.",
      "Chronicle Updates lists one line per release; tap one to see what changed. Unread ones are marked.",
      "The Diplomacy view recolours other empires' land by your standing with them instead of drawing over it. Its toggle is an icon on the minimap.",
      "Clicking anywhere in the tile panel no longer closes it, and Your frontier opens its explanation. Details no longer repeats what the panel already shows.",
      "The Victory race panel opens Ranks. The crest and screen buttons stay visible on the Manifest, AFC, Diplomacy, Ranks and profile screens.",
      "Settings opens in the middle of the screen straight away instead of sliding across.",
      "Economy shows one row per resource (Coin, Food, Titanium, Crystal, Umbrite): what you have, where it comes from and what uses it. Dev slots open the Development panel.",
      "The deal screen no longer offers a truce while one is already running."
    ]
  },
  {
    createdAt: 1793122776434, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.1",
    title: "Icons instead of emoji",
    why: "Emoji clashed with the game's own icon art.",
    changes: [
      "Trophies use the game's own icons instead of emoji.",
      "Fleets, the Senate, Space View, the tile menu, rush-buy, the Imperial Ward and victory alerts use plain symbols instead of emoji. Rush-buy now reads Rush ◉N.",
      "HUD preview: a profile's season numbers sit in one strip, Economy is a divided list instead of a box per resource, and the Ranks marker and unread dot no longer glow."
    ]
  }
];

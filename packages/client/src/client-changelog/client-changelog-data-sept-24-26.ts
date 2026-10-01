// Entries stamped 1790450114908-917 (the 2026.09.24-26 releases), moved out
// of client-changelog-data.ts as one batch to keep that file under the
// 500-line cap. Same rolling-window rules apply (see its header comment).
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SEPT_24_26: ClientChangelogEntry[] = [
  {
    createdAt: 1790450114908,
    introducedIn: "2026.09.26.1",
    title: "Planets you won in older seasons reappear in Space View",
    why: "Space View only looked at the newest 12 season archives, so once 12 newer seasons had ended, a Planet you won earlier vanished and the Space View button never appeared.",
    changes: [
      "Every season archive now counts toward the galaxy, so older won Planets are back on the map and in the panel",
      "The archives screen still shows only the newest 12 seasons"
    ]
  },
  {
    createdAt: 1790450114909,
    introducedIn: "2026.09.26.2",
    title: "Strategic map: pan, zoom, jump to the Court, and info on other systems",
    why: "The flat galaxy map could not be moved or zoomed, the Court was hard to find, and pressing a system that was not yours did nothing.",
    changes: [
      "Drag to pan and use the wheel or pinch to zoom the strategic map (1x to 6x); the wheel no longer leaves the map",
      "The Court button recentres on the Court landmark and opens the Court tab; pressing the landmark opens it too",
      "Pressing a system that is not yours, including an Unknown System, opens what is known about it and how to learn more",
      "A Fighter now costs 40 Production (was 80); a Probe stays at 25"
    ]
  },
  {
    createdAt: 1790450114910,
    introducedIn: "2026.09.26.3",
    title: "Convergence: when the Court falls, the top Duke takes the throne",
    why: "The Duke game had no ending: Court Strength could reach zero and nothing happened.",
    changes: [
      "When the Court falls, the Duke with the highest Domain Weight takes the throne and the era is recorded in a Hall of Fame (newest 50 kept)",
      "A new era begins with the Court back at full strength; planets, ships, developments and Stability carry over",
      "The Court tab shows the current era, whether you hold the throne, and the Hall of Fame",
      "Every Duke gets a Log line when an era ends"
    ]
  },
  {
    createdAt: 1790450114911, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.24.1",
    title: "No more gold cap, and your manpower bar now shows when it'll be full",
    why: "The gold storage cap (24h of income) punished players who couldn't log in fast enough to spend it, the same problem SHARD's storage was already exempted from. Separately, with no turns or shared clock, the only way to know if your manpower pool -- which regenerates continuously -- was worth checking on was to open the game and look.",
    changes: [
      "Gold has no storage cap any more -- it accrues without limit, same as SHARD",
      "Offline gold/resource accrual now covers up to 24 hours away (up from 12), so a longer break between visits doesn't leave income on the table",
      "Provincial Governors, Treasury State, Enduring Realm, and Golden Hegemony now boost your real town and dock gold income instead of a storage cap that no longer exists",
      "The manpower panel now shows \"Manpower full in Xh Ym\" (or \"Regen paused\" during a Titanium Levy freeze) so you know when it's worth coming back",
      "New \"Manpower Full\" email alert (with its own toggle in Email Notifications) lets you know once your manpower has filled up while you were away"
    ]
  },
  {
    createdAt: 1790450114912, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.24.2",
    title: "Structure build times now follow their manpower cost",
    why: "Flat build times let a big empire finish everything about as fast as a small one, which turned building into clicking rather than a real decision -- and let players race ahead of anyone who logs in less often. Manpower cost already grows as you build more, so time now grows with it too: 100 manpower takes 1 hour, scaling with whatever else changes that cost (tech, domains, Quartermaster's Office).",
    changes: [
      "Every structure's build time is now its manpower cost x 36 seconds (100 manpower = 1 hour), replacing the old flat per-structure timer -- this doesn't touch Settle, Expand, attacks, or muster, which keep their existing timers",
      "The first 5 Relay Beacons you own cost a discounted flat 30 minutes/50 manpower -- they came down with the landing party, pre-fab. From the 6th, a beacon costs a flat 100 manpower, about an hour to build",
      "Siege Battery/Tower/Dread Tower now cost 60/120/240 manpower to build (was 60 at every tier), so higher siege tiers take longer to raise, matching how the fort ladder already scales",
      "Fixed the Titanium Bastion/Thunder Bastion/Siege Tower/Dread Tower cost tooltips, which showed stale hardcoded numbers (including gold costs that haven't been charged in a long time) instead of each tier's real cost"
    ]
  },
  {
    createdAt: 1790450114913, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.25.1",
    title: "Attacking a fort or settled tile now loses a fixed amount of manpower",
    why: "Manpower lost attacking a fort or settled tile used to be a random draw within a range for that fort tier, the same whether you won or lost. It's now simply what you committed to the attack -- easier to plan around, and the foundation for a future \"commit more, win more\" attack option.",
    changes: [
      "Attacking a fort or settled tile now loses exactly the manpower you committed to the attack, win or lose, instead of a random draw within that fort tier's old range",
      "Barbarian raids and claiming FRONTIER land are unaffected -- they never used that range"
    ]
  },
  {
    createdAt: 1790450114914, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.25.2",
    title: "Weapons Factory manpower cost no longer rises with how many you own",
    why: "Each Titanium/Umbrite Weapons Factory cost 15% more manpower than the last one you owned, compounding without limit -- meant to make a large manpower pool matter for building, but a large pool already matters via cost/build-time scaling elsewhere, so this just made specializing in war industry needlessly expensive late-game.",
    changes: ["Titanium and Umbrite Weapons Factory now cost a flat 100 manpower per copy, however many you already own"]
  },
  {
    createdAt: 1790450114915, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.25.3",
    title: "A muster flag with a march order now has its own Attack tab to choose how hard to commit",
    why: "Attacking a fort or settled tile always committed exactly the required minimum, so there was no way to spend extra manpower for better odds even when you had plenty to spare.",
    changes: [
      "Any tile with your own muster flag now shows an Attack tab: a slider from the target's required manpower up to your whole manpower cap, three quick presets (Normal/Extra/Double), and a live win-chance readout",
      "Committing more than the minimum still costs exactly what you commit if the attack is lost or won, but raises your odds -- \"Save\" applies it to whatever this flag's next march/advance attack fires"
    ]
  },
  {
    createdAt: 1790450114916, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.26.1",
    title: "Muster flags no longer have their own manpower ceiling",
    why: "A muster flag used to stop filling at 10% of your manpower cap (plus whatever \"Expand Capacity\" presses you'd bought), well below your whole pool -- so the new Attack tab's commit slider (which goes up to your full manpower cap) was often aspirational, since the flag itself couldn't actually hold that much.",
    changes: [
      "A muster flag now fills straight to your whole manpower pool, with no smaller cap of its own",
      "\"Expand Capacity\" is gone from the tile menu -- there's nothing left to expand into"
    ]
  },
  {
    createdAt: 1790450114917, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.26.2",
    title: "A Defend-mode muster flag now shields nearby tiles from attack",
    why: "Attacks always fought the target tile's own defense alone, so a flag full of staged manpower did nothing to protect the ground around it -- there was no way to actually defend a front with mustered strength, only to attack with it.",
    changes: [
      "A muster flag in Hold mode now shields every tile within 3 tiles of itself: an incoming attack there is automatically matched by the flag's own staged manpower, up to what it holds, raising the defender's odds",
      "Any muster flag also shields its own tile this way, even in Advance or March mode, so an attacking flag isn't a free target",
      "Both sides lose the matched manpower, win or lose -- attacking straight into a full shield is poor value; flanking around it is the better play",
      "If more than one of your flags could shield the same tile, only the largest one counts -- shields don't stack"
    ]
  }
];

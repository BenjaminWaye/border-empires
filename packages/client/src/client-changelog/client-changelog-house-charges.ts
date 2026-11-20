import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOUSE_CHARGES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794593857641, // Date.now() captured once for this entry.
    introducedIn: "2026.11.13",
    title: "House Charges: secret objectives for your House",
    why: "Every House now has private goals of its own beside the five victory paths, so there is always something worth fighting for.",
    changes: [
      "Once your AFC lands, your House sends sealed charges: connect two named towns, grow a town into a City, chart a landmass, garrison a named desert or tundra, or wake a Concordance installation.",
      "Your charges are in your own profile: tap your crest, then Manage charges. You are offered three and keep two; you can change which two for a day after they arrive.",
      "A charge only counts if you still hold it when the Sector Contest's winner is crowned. Nobody else can see your charges.",
      "Show on map takes you to a charge and marks it on the map: target towns and relics get guide rings, and a landmass, desert or tundra is outlined in gold, green where you garrison it and hatched where you still need to.",
      "When the winner is crowned, every House's charges are unsealed in a new House Charges tab of the season-end screen.",
      "Each charge you hold to the end becomes a collectible card, drawn from the shape you actually held. Your cards show in your profile under Charge Cards; the season winner's are foil.",
      "Fulfilled charges also count in the galaxy: +1 Domain Weight each while you hold a Planet or Outpost, or +3 Influence on that Sector Contest's Stipend.",
      "If you lose a charge you were holding, you get a private alert with Show on map, even if it happened while you were away. Nobody else is told.",
      "Until you have explored a charge's target, rings mark the area to search instead. A relic charge only marks an area until you find the installation's beacon."
    ]
  },
  {
    createdAt: 1794807272244, // Date.now() captured once for this entry.
    introducedIn: "2026.11.16",
    title: "House Charges: clearer choices and directions",
    why: "Playtesters could not tell whether their pick was saved, what the diamonds meant, or where a Charter's second town was.",
    changes: [
      "When your charges arrive you get an alert telling you to pick two, with the deadline.",
      "The Charges panel says which two you are keeping and how to swap, instead of a greyed-out Keep button.",
      "The diamonds on a charge show its difficulty, and the panel says what a held charge earns.",
      "If one of a Charter's towns is still unscouted, the card gives a rough bearing to it, and Show on map goes to the town you have seen and keeps the search rings up.",
      "Your career panel shows how your rating compares with the 1,200 starting rating."
    ]
  },
  {
    createdAt: 1795038711807, // Date.now() captured once for this entry.
    introducedIn: "2026.11.18",
    title: "House Charges: sealed cards instead of an alert",
    why: "The House charges alert could be buried under other alerts, and it read like a warning rather than a gift from your House.",
    changes: [
      "House Charge cards now have a back: a gold-leaf frame around diagonal ribs of dark and light blue, with a brass cog seal in the middle.",
      "When your charges arrive, three face-down charge cards bob at the left edge of the map with a note that your House has handed you sealed charges. Tap the cards to choose which two to keep.",
      "The note can be closed on its own; the cards stay until you open your charges or the choice closes."
    ]
  },
  {
    createdAt: 1795071970851, // Date.now() captured once for this entry.
    introducedIn: "2026.11.19",
    title: "House Charges: pick between cards, and find them again",
    why: "A playtester tapped the sealed-charges note twice and it vanished both times, so he never saw his charges. Once seen, charges were hard to find again, and choosing them meant ticking boxes.",
    changes: [
      "Tapping the note that your House has handed you sealed charges now opens your charges, like tapping the cards. The note also says See charges.",
      "The note's × sits further from the words, so a tap on the message no longer closes it by mistake.",
      "You now choose your charges from a hand of cards: they are dealt face down and turn over, and you tap a card to keep it or set it aside.",
      "After you have opened your charges, the cards stay at the edge of the map with how many of your kept charges you hold. Tap them any time to see your charges."
    ]
  },
  {
    createdAt: 1795104690676, // Date.now() captured once for this entry.
    introducedIn: "2026.11.19",
    title: "House Charges: Show on map shows the whole goal",
    why: "Pressing Show on map on a charge left the cards open over the map, so you had to close them to look, and the camera framed only one of a road's two towns. On the 3D map the storm clouds over unexplored land hid the charge's markings.",
    changes: [
      "Show on map now closes your charges and moves the camera to the whole goal, zooming out so both towns of a road (or the whole area) are on screen, on the 2D and 3D maps alike. If a goal is too wide to fit even fully zoomed out, the town you have scouted stays in view.",
      "While a charge is shown, the cards at the edge of the map say which one and have a Back to cards button. The × next to it stops showing the charge.",
      "On the 3D map, a charge's dotted circles, road line and shaded area now draw over the unexplored storm clouds instead of being hidden under them."
    ]
  },
  {
    createdAt: 1795105167432, // Date.now() captured once for this entry.
    introducedIn: "2026.11.19",
    title: "House Charges: everything on the card",
    why: "Each charge was shown twice, as a small card and again as a description below it, and the small cards were too narrow for their own titles.",
    changes: [
      "Each charge is now one large card you scroll through, with its objective, progress, Keep button and Show on map on the card itself.",
      "Each card's quote is your House's reason for handing you that charge.",
      "Each kept card shows the Domain score it banks if you still hold it when the winner is crowned. The text above the cards is one line; tap How charges work for the details."
    ]
  },
  {
    createdAt: 1795125697861, // Date.now() captured once for this entry.
    introducedIn: "2026.11.19",
    title: "House Charges: a hand of cards on desktop",
    why: "On desktop the charges sat one at a time in a narrow panel, the card text was too faint to read, and different charges had the same picture.",
    changes: [
      "On a wide screen your charges float side by side over the dimmed map, bobbing gently and lifting when you point at one.",
      "Opening your charges draws the cards from a deck and turns them over.",
      "Show on map folds the hand into the cards at the edge of the map, with the charge you picked face up on top. Tap them to bring the hand back.",
      "Card text is dark ink on the parchment again, so it is easy to read.",
      "Each kind of charge has its own picture: a road between two towns, a keep, three towers, a charted island, dunes, ice peaks, a waking beacon or a grievance banner."
    ]
  }
];

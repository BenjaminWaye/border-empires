import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUD_NEXT_STEPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "A next step when you run out of things to do",
  why: "Playtesters ran short of coin, found nothing to build and stopped. Several HUD labels and screens also gave no hint of what they were for.",
  changes: [
    "While no garrison or build is running, the tracker shows a Next step: build a Relay Beacon when you have garrisoned land for one, or how long until your coin covers the next Manifest at your coin per day. On a phone the folded tracker says Next; tap it for the steps",
    "An unaffordable Manifest now says how much coin you still need and when you will have it",
    "The manpower orb says \"full\" or \"over cap · spend to refill\" instead of dropping its countdown, since no batch comes at or over capacity",
    "The House charges alert has a Manage charges button, shows even if another alert was up when your charges arrived, and Manage charges now sits at the top of your profile",
    "Manifest, Towns, AFC, Diplomacy, Ranks, Chronicle, your profile and the Manpower, Integrity and House Charges panels each show a one-line explanation under their title"
  ]
};

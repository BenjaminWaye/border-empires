import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACTION_FEEDBACK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.15",
  title: "Scout drones, queued expansions and Garrison Many say what happened",
  why: "Playtesters launched a scout drone and never saw a message or a report, queued expansions kept spending manpower for hours with nothing on screen, and Garrison Many ignored taps without saying why.",
  changes: [
    "Launching a scout drone and its scout report now appear on screen, with a Show button that centres the map on where it went",
    "While the drone is out, Explore stays on the tile bar greyed, with the time until it is back",
    "The tracker lists your queued expansions, notes the ones waiting on manpower, and has Cancel all",
    "Expanding to a tile that has to wait behind earlier expansions says where it is in the queue",
    "Garrison Many says why a tile can't be selected, such as Outside your reach, including the tile you opened it from"
  ]
};

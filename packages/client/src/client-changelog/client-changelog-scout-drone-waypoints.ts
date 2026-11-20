import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Owner design 2026-11-20: exploring as a planned route with charges, guided on the map.
export const SCOUT_DRONE_WAYPOINTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Plan scout drone routes",
  why: "One straight flight out and back at Expand To pace took minutes and revealed nothing new on the way home, so exploring your surroundings meant relaunching the drone again and again.",
  changes: [
    "Tap the fog to start a route; each tap adds a stop, and tapping a stop removes it",
    "Each stop costs a charge: you have 8, and each comes back 4 hours after you spend it",
    "A leg reaches up to 20 tiles past your land; tap farther and the stop is pulled back to its limit, shown on the route",
    "The drone flies 1 tile a second, through every stop, then straight home over new ground",
    "While the drone is out, tap the fog again to add stops to its route: no waiting for it to come back",
    "Spent charges are kept through server restarts",
    "The bar at the bottom shows your charges, the flight time and Go; in the 3D map the route glows on the ground before you send it"
  ]
};

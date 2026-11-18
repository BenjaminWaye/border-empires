import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REACH_BUILD_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Reach and build fixes",
  why: "Build stayed lit on tiles outside your reach, failed with a raw error code, and then left the tile stuck on \"Build already queued\". Towns could also sit Unfed with no hint how to feed them.",
  changes: [
    "Build is greyed out with \"Outside your reach\" on frontier tiles you can't garrison yet",
    "A refused garrison or build no longer leaves the tile stuck on \"Build already queued\"",
    "Refusals read in plain words instead of error codes",
    "Towns, docks and captured buildings no longer say you can't garrison them while Garrison works",
    "The reach note says reach spreads over land only: mountains and sea stop it",
    "Unfed towns say how to fix it: garrison grain or fish in your reach"
  ]
};

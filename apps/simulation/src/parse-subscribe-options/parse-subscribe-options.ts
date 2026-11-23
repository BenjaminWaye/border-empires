export type SubscribeOptions = {
  mode: "bootstrap-only" | "live";
  emitBootstrapEvent: boolean;
  subscriptionKey?: string;
  fullVisibility: boolean;
  trigger?: string;
  omitTiles?: boolean;
  // Admin reveal ("spectate"): when present, turns the extra unfiltered tile
  // delta stream on or off for this player (tile-delta-fanout-filter.ts).
  // Absent leaves the current setting alone.
  spectate?: boolean;
  // The call only carries the spectate switch: no subscription is registered
  // and no snapshot is built (live-subscribe-reach-push.ts).
  spectateOnly?: boolean;
};

export const parseSubscribeOptions = (subscriptionJson: string | undefined): SubscribeOptions => {
  if (!subscriptionJson) return { mode: "live", emitBootstrapEvent: true, fullVisibility: false, omitTiles: false };
  try {
    const parsed = JSON.parse(subscriptionJson) as {
      mode?: unknown;
      emitBootstrapEvent?: unknown;
      subscriptionKey?: unknown;
      fullVisibility?: unknown;
      trigger?: unknown;
      omitTiles?: unknown;
      spectate?: unknown;
      spectateOnly?: unknown;
    };
    return {
      mode: parsed.mode === "bootstrap-only" ? "bootstrap-only" : "live",
      emitBootstrapEvent: parsed.emitBootstrapEvent === false ? false : parsed.mode === "bootstrap-only" ? false : true,
      ...(typeof parsed.subscriptionKey === "string" && parsed.subscriptionKey.length > 0 ? { subscriptionKey: parsed.subscriptionKey } : {}),
      fullVisibility: parsed.fullVisibility === true,
      ...(typeof parsed.trigger === "string" && parsed.trigger.length > 0 ? { trigger: parsed.trigger } : {}),
      omitTiles: parsed.omitTiles === true,
      ...(typeof parsed.spectate === "boolean" ? { spectate: parsed.spectate } : {}),
      ...(parsed.spectateOnly === true ? { spectateOnly: true } : {})
    };
  } catch {
    return { mode: "live", emitBootstrapEvent: true, fullVisibility: false, omitTiles: false };
  }
};

// snapshotCacheByPlayerId only ever holds a full-visibility snapshot
// post-season-end (warmSeasonEndSnapshots); otherwise it's fog-limited, so an
// explicit full-vis subscribe (admin reveal-map/spectator) must skip it
// during an active season rather than replay stale fog-limited tiles.
export const shouldServeCachedSubscribeSnapshot = (fullVisibility: boolean, seasonEnded: boolean): boolean =>
  fullVisibility !== true || seasonEnded;

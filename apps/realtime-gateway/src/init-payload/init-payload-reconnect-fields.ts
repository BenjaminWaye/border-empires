import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type LiveSnapshotPlayer = PlayerSubscriptionSnapshot["player"];

export type PlayerReconnectFields = {
  eventLog?: NonNullable<LiveSnapshotPlayer>["eventLog"];
  logisticsThroughputPerMinute?: number;
  imperialWardCharges?: number;
  wonderLastFreeRushBuyAt?: number;
};

// eventLog/logisticsThroughputPerMinute/imperialWardCharges/wonderLastFreeRushBuyAt
// are the same allowlist gap as devQueue/waypointQueue in init-payload.ts: the
// client reads each of these off msg.player unconditionally (no server value
// means the numeric fields are wiped on reconnect), but init-payload never set
// them. Anything added to PlayerSubscriptionSnapshot["player"] that the client
// needs on reconnect must be copied here too.
export const playerReconnectFields = (liveSnapshotPlayer: LiveSnapshotPlayer | undefined): PlayerReconnectFields => ({
  ...(liveSnapshotPlayer?.eventLog ? { eventLog: liveSnapshotPlayer.eventLog } : {}),
  ...(typeof liveSnapshotPlayer?.logisticsThroughputPerMinute === "number"
    ? { logisticsThroughputPerMinute: liveSnapshotPlayer.logisticsThroughputPerMinute }
    : {}),
  ...(typeof liveSnapshotPlayer?.imperialWardCharges === "number"
    ? { imperialWardCharges: liveSnapshotPlayer.imperialWardCharges }
    : {}),
  ...(typeof liveSnapshotPlayer?.wonderLastFreeRushBuyAt === "number"
    ? { wonderLastFreeRushBuyAt: liveSnapshotPlayer.wonderLastFreeRushBuyAt }
    : {})
});

import type { PlayerActivityEntry, TileKey } from "@border-empires/shared";

const PLAYER_ACTIVITY_INBOX_CAP = 24;

export const appendPlayerActivityEntry = (
  inbox: PlayerActivityEntry[],
  entry: PlayerActivityEntry,
  cap = PLAYER_ACTIVITY_INBOX_CAP
): PlayerActivityEntry[] => {
  const next = [...inbox, entry];
  return next.slice(Math.max(0, next.length - cap));
};

export const buildTownActivityEntry = (args: {
  kind: "captured" | "lost";
  townName: string;
  actorName: string;
  tileKey: TileKey;
  at: number;
}): PlayerActivityEntry => ({
  id: `${args.kind}:${args.tileKey}:${args.at}`,
  title: args.kind === "captured" ? "Town Captured" : "Town Lost",
  detail: args.kind === "captured" ? `You captured ${args.townName} from ${args.actorName}.` : `${args.townName} was captured by ${args.actorName}.`,
  type: "combat",
  severity: args.kind === "captured" ? "success" : "error",
  at: args.at,
  tileKey: args.tileKey,
  actionLabel: "Center"
});

import { serverClock } from "../client-server-clock/client-server-clock.js";

export const resourceTradeServerNow = (): number => Date.now() + serverClock.offsetMs();

export const resourceDeadlineHtml = (expiresAt: number | undefined, now: number): string => {
  if (expiresAt === undefined) return "Until ended";
  const minutes = Math.max(1, Math.ceil((expiresAt - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remaining = days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  const deadline = new Date(expiresAt);
  return `<time datetime="${deadline.toISOString()}" title="${deadline.toLocaleString()}">${remaining} left</time>${minutes <= 24 * 60 ? " · Ends soon" : ""}`;
};

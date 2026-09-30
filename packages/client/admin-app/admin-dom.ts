// Tiny DOM + formatting helpers for the admin page. Text is always set via
// textContent, never innerHTML, so player names can't inject markup.

type Child = Node | string;

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: Child[] = []): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
};

export const formatPercent = (numerator: number, denominator: number): string =>
  denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "–";

export const formatDuration = (ms: number | undefined): string => {
  if (ms === undefined || !Number.isFinite(ms)) return "–";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.round(hours / 24)}d`;
};

export const formatWhen = (at: number | undefined): string =>
  at ? new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

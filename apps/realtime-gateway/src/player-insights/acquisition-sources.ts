// Per-source breakdown of the anonymous pre-login funnel, so outreach posts
// (one tagged link per subreddit/post, see scripts/outreach/) can be compared
// on visitors and sign-ups instead of guessed at.
//
// Each visitor is attributed once, from their *visit* row: utm_source (plus
// utm_campaign, which outreach links use for the individual post) when the
// link carried one, otherwise the referrer host, otherwise "direct". Later
// steps (form shown, method clicked, sign-up) carry no utm detail of their
// own, so they are joined back to the visitor's source by visitorId.
import type { AcquisitionStepRow } from "../player-funnel-store/player-funnel-store.js";

// Bounded: the table is for "which posts worked", not a raw log. Rows past
// the cap fold into a single "other" row so totals still add up.
export const ACQUISITION_SOURCE_ROW_LIMIT = 40;
export const OTHER_SOURCE = "other";
export const DIRECT_SOURCE = "direct";

export type AcquisitionSourceRow = {
  source: string;
  campaign: string | undefined;
  visitors: number;
  formShown: number;
  methodClicked: number;
  signUps: number;
};

type Attribution = { source: string; campaign: string | undefined };

// Reddit links reach us from many hosts (old., new., out., m., the bare
// domain); fold them so "reddit" is one row when a link had no utm tag.
const normaliseReferrerHost = (host: string): string => {
  const lower = host.toLowerCase().replace(/^www\./, "");
  if (lower === "reddit.com" || lower.endsWith(".reddit.com")) return "reddit.com";
  return lower;
};

export const attributeVisit = (detail: Record<string, string>): Attribution => {
  const utmSource = detail.utmSource?.trim().toLowerCase();
  if (utmSource) return { source: utmSource, campaign: detail.utmCampaign?.trim().toLowerCase() || undefined };
  if (detail.referrerHost) return { source: normaliseReferrerHost(detail.referrerHost), campaign: undefined };
  return { source: DIRECT_SOURCE, campaign: undefined };
};

const rowKey = (attribution: Attribution): string => `${attribution.source}\u0000${attribution.campaign ?? ""}`;

export const buildAcquisitionSources = (rows: readonly AcquisitionStepRow[], since: number): AcquisitionSourceRow[] => {
  const inWindow = rows.filter((row) => row.at >= since);
  const byVisitor = new Map<string, Attribution>();
  for (const row of inWindow) {
    if (row.step === "visit" && !byVisitor.has(row.visitorId)) byVisitor.set(row.visitorId, attributeVisit(row.detail));
  }

  const table = new Map<string, AcquisitionSourceRow>();
  const rowFor = (attribution: Attribution): AcquisitionSourceRow => {
    const key = rowKey(attribution);
    let entry = table.get(key);
    if (!entry) {
      entry = { source: attribution.source, campaign: attribution.campaign, visitors: 0, formShown: 0, methodClicked: 0, signUps: 0 };
      table.set(key, entry);
    }
    return entry;
  };

  for (const row of inWindow) {
    // A step whose visit fell outside the window (or was pruned) has no
    // known source; count it as direct rather than dropping it.
    const entry = rowFor(byVisitor.get(row.visitorId) ?? { source: DIRECT_SOURCE, campaign: undefined });
    if (row.step === "visit") entry.visitors += 1;
    else if (row.step === "auth_form_shown") entry.formShown += 1;
    else if (row.step === "auth_method_clicked") entry.methodClicked += 1;
    else if (row.step === "sign_up") entry.signUps += 1;
  }

  const sorted = [...table.values()].sort((a, b) => b.signUps - a.signUps || b.visitors - a.visitors || a.source.localeCompare(b.source));
  if (sorted.length <= ACQUISITION_SOURCE_ROW_LIMIT) return sorted;
  const kept = sorted.slice(0, ACQUISITION_SOURCE_ROW_LIMIT - 1);
  const other: AcquisitionSourceRow = { source: OTHER_SOURCE, campaign: undefined, visitors: 0, formShown: 0, methodClicked: 0, signUps: 0 };
  for (const entry of sorted.slice(ACQUISITION_SOURCE_ROW_LIMIT - 1)) {
    other.visitors += entry.visitors;
    other.formShown += entry.formShown;
    other.methodClicked += entry.methodClicked;
    other.signUps += entry.signUps;
  }
  return [...kept, other];
};

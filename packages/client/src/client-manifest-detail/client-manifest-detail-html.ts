// The one Manifest detail view, shared by the desktop side panel ("inline")
// and the mobile overlay ("overlay"). Layout: a fixed header (type, name,
// status, Good pick badge), one scrolling body (what you get, why it fits,
// what it leads to), and a fixed footer with the unlock button -- replacing
// the old card-inside-a-card that scrolled the whole side panel and pushed
// the Unlock button below the fold.
//
// Hooks kept for client-hud.ts's existing delegated handlers:
// data-tech-detail-close, data-tech-unlock, data-tech-card,
// data-structure-info, data-crystal-ability-info.
import { techBlockedReasonSummary } from "../client-tech-requirements/client-tech-requirements.js";
import type { StructureInfoKey } from "../client-map-display.js";
import type { TechInfo } from "../client-types.js";
import { manifestFit, type ManifestFitInput } from "./client-manifest-fit.js";
import { manifestGainRows, type ManifestGainRow } from "./client-manifest-gains.js";
import { manifestFlavorLine, manifestKicker } from "./client-manifest-labels.js";
import { manifestLeadsTo, type ManifestLeadsTo } from "./client-manifest-leads-to.js";

export type ManifestDetailMode = "inline" | "overlay";

export type ManifestDetailContext = {
  tech: TechInfo;
  mode: ManifestDetailMode;
  techCatalog: readonly TechInfo[];
  ownedTechIds: readonly string[];
  pendingTechUnlockId: string;
  isPendingTechUnlock: (techId: string) => boolean;
  techPrereqIds: (tech: Pick<TechInfo, "prereqIds">) => string[];
  techNameList: (ids: string[]) => string;
  techTier: (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>) => number;
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
  structureDetail?: (type: StructureInfoKey) => string | undefined;
  coin?: number;
  // Omitted in contexts without live player state (tests, previews): no
  // Good pick badge or "Not useful yet" note is shown then.
  fit?: ManifestFitInput;
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const RESOURCE_COST_KEYS = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const;

export const manifestCostLabel = (tech: Pick<TechInfo, "requirements">): string => {
  const bits: string[] = [];
  if ((tech.requirements.gold ?? 0) > 0) bits.push(`${tech.requirements.gold.toLocaleString()} coin`);
  for (const key of RESOURCE_COST_KEYS) {
    const amount = tech.requirements.resources?.[key] ?? 0;
    if (amount > 0) bits.push(`${amount.toLocaleString()} ${key.toLowerCase()}`);
  }
  return bits.join(" + ");
};

type ManifestStatus = "owned" | "pending" | "ready" | "locked";

const statusFor = (context: ManifestDetailContext): ManifestStatus => {
  const { tech } = context;
  if (context.ownedTechIds.includes(tech.id)) return "owned";
  if (context.isPendingTechUnlock(tech.id)) return "pending";
  if (tech.requirements.canResearch && !context.pendingTechUnlockId) return "ready";
  return "locked";
};

const STATUS_CHIP: Record<ManifestStatus, string> = {
  owned: "Owned",
  pending: "Unlocking…",
  ready: "Ready to unlock",
  locked: "Locked"
};

const gainsHtml = (rows: ManifestGainRow[], owned: boolean): string => {
  if (rows.length === 0) return "";
  const items = rows
    .map(
      (row) => `<li class="manifest-gain manifest-gain--${row.kind}">
        <span class="manifest-gain__icon" aria-hidden="true">${row.icon}</span>
        <span class="manifest-gain__main">${row.html}</span>${row.detail ? `<span class="manifest-gain__detail">${escapeHtml(row.detail)}</span>` : ""}
      </li>`
    )
    .join("");
  return `<section class="manifest-section">
    <h4 class="manifest-section__title">${owned ? "What it gave you" : "What you get"}</h4>
    <ul class="manifest-gains">${items}</ul>
  </section>`;
};

const fitHtml = (reasons: string[], notUsefulYet: string | undefined): string => {
  const parts: string[] = [];
  if (reasons.length > 0) {
    parts.push(`<ul class="manifest-fit manifest-fit--good">${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`);
  }
  // Next to a Good pick badge, "Not useful yet" would read as a contradiction;
  // the fact still matters (you'll need that resource first), so it stays as a heads-up.
  if (notUsefulYet) parts.push(`<p class="manifest-fit manifest-fit--later">${reasons.length > 0 ? "Heads-up" : "Not useful yet"}: ${escapeHtml(notUsefulYet)}</p>`);
  return parts.join("");
};

const leadsToHtml = (leadsTo: ManifestLeadsTo): string => {
  if (leadsTo.next.length === 0) return "";
  const items = leadsTo.next
    .map(
      (entry) => `<li class="manifest-lead${entry.owned ? " manifest-lead--owned" : ""}">
        <button class="manifest-lead__link" type="button" data-tech-card="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</button>
        <span class="manifest-lead__tier">T${entry.tier}</span>
        ${entry.owned ? `<span class="manifest-lead__note">owned</span>` : entry.alsoNeeds.length > 0 ? `<span class="manifest-lead__note">also needs ${escapeHtml(entry.alsoNeeds.join(", "))}</span>` : ""}
      </li>`
    )
    .join("");
  const later = leadsTo.laterCount > 0 ? `<p class="manifest-lead__later">…and ${leadsTo.laterCount} more Manifest${leadsTo.laterCount === 1 ? "" : "s"} further down this branch.</p>` : "";
  return `<section class="manifest-section">
    <h4 class="manifest-section__title">Leads to</h4>
    <ul class="manifest-leads">${items}</ul>${later}
  </section>`;
};

const footerHtml = (context: ManifestDetailContext, status: ManifestStatus): string => {
  const { tech } = context;
  if (status === "owned") return `<footer class="manifest-detail__foot"><span class="manifest-detail__owned">✓ You own this Manifest</span></footer>`;
  const cost = manifestCostLabel(tech);
  const prereqs = context.techPrereqIds(tech);
  const blocked = status === "locked" ? techBlockedReasonSummary(tech, prereqs.length > 0 ? `Requires ${context.techNameList(prereqs)}` : "Not available yet") : undefined;
  const coinHint =
    blocked?.tone === "missing" && typeof context.coin === "number" && (tech.requirements.gold ?? 0) > context.coin
      ? ` (you have ${Math.floor(context.coin).toLocaleString()} coin)`
      : "";
  const reason = blocked ? `<p class="manifest-detail__reason manifest-detail__reason--${blocked.tone}">${escapeHtml(blocked.label)}${escapeHtml(coinHint)}</p>` : "";
  const label = status === "pending" ? "Unlocking…" : status === "ready" ? `Unlock${cost ? ` · ${escapeHtml(cost)}` : ""}` : "Locked";
  return `<footer class="manifest-detail__foot">${reason}
    <button class="panel-btn tech-unlock-btn manifest-detail__unlock" type="button" data-tech-unlock="${escapeHtml(tech.id)}" ${status === "ready" || status === "pending" ? "" : "disabled"}>${label}</button>
  </footer>`;
};

export const renderManifestDetailHtml = (context: ManifestDetailContext): string => {
  const { tech } = context;
  const status = statusFor(context);
  const byId = new Map(context.techCatalog.map((item) => [item.id, item]));
  const tier = context.techTier(tech.id, byId, new Map());
  const gains = manifestGainRows(tech, {
    structureInfoButtonHtml: context.structureInfoButtonHtml,
    ...(context.structureDetail ? { structureDetail: context.structureDetail } : {})
  });
  const fit = status !== "owned" && context.fit ? manifestFit(tech, context.fit) : { goodPickReasons: [] as string[] };
  const goodPick = fit.goodPickReasons.length > 0;
  const leadsTo = manifestLeadsTo(tech.id, {
    techCatalog: context.techCatalog,
    ownedTechIds: context.ownedTechIds,
    techPrereqIds: context.techPrereqIds,
    techTier: context.techTier
  });
  const article = `<article class="manifest-detail manifest-detail--${context.mode}" data-manifest-detail="${escapeHtml(tech.id)}">
    <header class="manifest-detail__head">
      <div class="manifest-detail__titles">
        <span class="manifest-detail__kicker">${escapeHtml(manifestKicker(tech, tier))}</span>
        <h3 class="manifest-detail__name">${escapeHtml(tech.name)}</h3>
        <div class="manifest-detail__chips">
          <span class="manifest-chip manifest-chip--${status}">${STATUS_CHIP[status]}</span>
          ${goodPick ? `<span class="manifest-chip manifest-chip--good-pick">Good pick</span>` : ""}
        </div>
      </div>
      <button class="manifest-detail__close" type="button" aria-label="Close Manifest details" data-tech-detail-close="button">×</button>
    </header>
    <div class="manifest-detail__body">
      <p class="manifest-detail__flavor">${escapeHtml(manifestFlavorLine(tech.description))}</p>
      ${fitHtml(fit.goodPickReasons, "notUsefulYet" in fit ? fit.notUsefulYet : undefined)}
      ${gainsHtml(gains, status === "owned")}
      ${leadsToHtml(leadsTo)}
    </div>
    ${footerHtml(context, status)}
  </article>`;
  if (context.mode === "inline") return article;
  return `<div class="tech-detail-backdrop" data-tech-detail-close="backdrop"></div>
    <div class="manifest-detail-modal">${article}</div>`;
};

import type { TechInfo } from "../client-types.js";

type ChecklistItem = { label: string; met: boolean };

const RESOURCE_LABEL_RE = /^(gold|food|titanium|crystal|umbrite|shard|oil)\b/i;

const checklistForTech = (tech: Pick<TechInfo, "requirements">): ChecklistItem[] => tech.requirements.checklist ?? [];

export const unmetChecklistItemsForTech = (tech: Pick<TechInfo, "requirements">): ChecklistItem[] =>
  checklistForTech(tech).filter((item) => !item.met);

export const unmetResourceChecklistItemsForTech = (tech: Pick<TechInfo, "requirements">): ChecklistItem[] =>
  unmetChecklistItemsForTech(tech).filter((item) => RESOURCE_LABEL_RE.test(item.label.trim()));

export const unmetNonResourceChecklistItemsForTech = (tech: Pick<TechInfo, "requirements">): ChecklistItem[] =>
  unmetChecklistItemsForTech(tech).filter((item) => !RESOURCE_LABEL_RE.test(item.label.trim()));

export const techShouldHighlightMissingResources = (tech: Pick<TechInfo, "requirements">): boolean =>
  unmetNonResourceChecklistItemsForTech(tech).length === 0 && unmetResourceChecklistItemsForTech(tech).length > 0;

export const techMissingResourceSummary = (tech: Pick<TechInfo, "requirements">, maxItems = 2): string | null => {
  if (!techShouldHighlightMissingResources(tech)) return null;
  const unmetResources = unmetResourceChecklistItemsForTech(tech);
  const labels = unmetResources.slice(0, maxItems).map((item) => `✗ ${item.label}`);
  const overflow = unmetResources.length - labels.length;
  return `${labels.join(" · ")}${overflow > 0 ? ` +${overflow} more` : ""}`;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const techMissingResourceSummaryHtml = (tech: Pick<TechInfo, "requirements">, maxItems = 2): string | null => {
  if (!techShouldHighlightMissingResources(tech)) return null;
  const unmetResources = unmetResourceChecklistItemsForTech(tech);
  const badges = unmetResources
    .slice(0, maxItems)
    .map(
      (item) =>
        `<span class="tech-missing-badge"><span class="tech-missing-badge-icon" aria-hidden="true">✕</span><span>${escapeHtml(item.label)}</span></span>`
    );
  const overflow = unmetResources.length - badges.length;
  if (overflow > 0) badges.push(`<span class="tech-missing-more">+${overflow} more</span>`);
  return badges.join("");
};

export const techBlockedReasonSummary = (
  tech: Pick<TechInfo, "requirements" | "lockedReason">,
  prereqFallback: string
): { label: string; tone: "missing" | "blocked" } => {
  // A monument's unlock tech reports this once someone's assembly of that
  // monument stands this season (see MONUMENT_UNLOCK_TECH_ID, shared
  // package) — takes priority over the generic prereq/resource messaging so
  // the player sees why it's actually locked instead of a misleading
  // "requires X" that reads as still-achievable.
  if (tech.lockedReason) return { label: tech.lockedReason, tone: "blocked" };
  const missingResources = techMissingResourceSummary(tech);
  if (missingResources) return { label: missingResources, tone: "missing" };
  const unmetOther = unmetNonResourceChecklistItemsForTech(tech)[0];
  if (unmetOther) return { label: unmetOther.label, tone: "blocked" };
  return { label: prereqFallback, tone: "blocked" };
};

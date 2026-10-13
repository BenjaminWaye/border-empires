// "Your Manifests": the ones you already hold, grouped by branch as compact
// buttons. Tapping one opens the same detail view in its "What it gave you"
// mode (client-hud.ts's existing [data-tech-card] handler). Replaces the old
// unclickable stack of full-description cards at the bottom of the panel.
import type { TechInfo } from "../client-types.js";
import { manifestGainSummary } from "./client-manifest-gains.js";
import { manifestBranchLabel, manifestTypeLabel } from "./client-manifest-labels.js";

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const BRANCH_ORDER = ["war", "economy", "manpower", "aether"];

export const techOwnedHtml = (
  techCatalog: TechInfo[],
  ownedTechIds: string[],
  isPendingTechUnlock: (techId: string) => boolean = () => false
): string => {
  if (ownedTechIds.length === 0) {
    return `<section class="manifest-owned"><h4 class="manifest-section__title">Your Manifests</h4><p class="manifest-owned__empty">You haven't taken any Manifests yet.</p></section>`;
  }
  const byId = new Map(techCatalog.map((tech) => [tech.id, tech]));
  const groups = new Map<string, TechInfo[]>();
  for (const id of ownedTechIds) {
    const tech = byId.get(id);
    if (!tech) continue;
    const branch = tech.branch ?? "other";
    groups.set(branch, [...(groups.get(branch) ?? []), tech]);
  }
  const branches = [...groups.keys()].sort((a, b) => {
    const ai = BRANCH_ORDER.indexOf(a);
    const bi = BRANCH_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
  });
  const groupsHtml = branches
    .map((branch) => {
      const techs = (groups.get(branch) ?? []).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
      const buttons = techs
        .map(
          (tech) => `<button class="manifest-owned__item" type="button" data-tech-card="${escapeHtml(tech.id)}" title="${escapeHtml(manifestGainSummary(tech))}">
            <span class="manifest-owned__name">${escapeHtml(tech.name)}</span>
            <span class="manifest-owned__type">${escapeHtml(manifestTypeLabel(tech))}${isPendingTechUnlock(tech.id) ? " · unlocking…" : ""}</span>
          </button>`
        )
        .join("");
      return `<div class="manifest-owned__group">
        <span class="manifest-owned__branch">${escapeHtml(manifestBranchLabel(branch) ?? "Other")}</span>
        <div class="manifest-owned__items">${buttons}</div>
      </div>`;
    })
    .join("");
  return `<section class="manifest-owned">
    <h4 class="manifest-section__title">Your Manifests (${ownedTechIds.length})</h4>
    <p class="manifest-owned__hint">Tap one to see what it gave you.</p>
    ${groupsHtml}
  </section>`;
};

import { AFC_MODULE_BAY_COUNT } from "@border-empires/shared";
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import { AFC_MODULE_FAMILY_LABELS, afcBayAngleRadians, type AfcBayView, type AfcModuleBaysView } from "./client-afc-module-bays-model.js";


const STATUS_TEXT: Readonly<Record<Exclude<AfcBayView["state"], "empty">, string>> = {
  docked: "Docked · your House copy, can be called down to another AFC",
  captured: "Docked · captured copy, stays on this AFC",
  incoming: "On its way"
};

// Hub, the four diagonal manipulator arms and the bay ring, drawn under the
// absolutely positioned bay buttons (viewBox units = percent of the diagram).
const diagramSvg = (): string => {
  const arms = [1, 3, 5, 7]
    .map((k) => {
      const a = afcBayAngleRadians(k);
      return `<line class="afc-bays-arm" x1="50" y1="50" x2="${(50 + Math.cos(a) * 31).toFixed(2)}" y2="${(50 + Math.sin(a) * 31).toFixed(2)}" />`;
    })
    .join("");
  return `<svg class="afc-bays-svg" viewBox="0 0 100 100" aria-hidden="true"><circle class="afc-bays-ring" cx="50" cy="50" r="38" />${arms}<circle class="afc-bays-hub" cx="50" cy="50" r="15" /></svg>`;
};

const bayButtonHtml = (bay: AfcBayView): string => {
  const label = bay.state === "empty" ? `Bay ${bay.index + 1}: empty` : `Bay ${bay.index + 1}: ${bay.name ?? ""}${bay.state === "incoming" ? " (incoming)" : ""}`;
  const familyClass = bay.family ? ` is-family-${bay.family}` : "";
  return `<button type="button" class="afc-bay is-${bay.state}${familyClass}" style="left:${bay.leftPercent}%;top:${bay.topPercent}%" data-afc-bay="${bay.index}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${bay.state === "empty" ? "+" : escapeHtml(bay.shortName ?? "?")}</button>`;
};

const callDownListHtml = (view: AfcModuleBaysView): string => {
  if (!view.isOwner) return `<p class="afc-bay-note">Only this AFC's owner can call modules down to it.</p>`;
  if (view.dormant) return `<p class="afc-bay-note">This AFC is dormant. Reclaim it before calling modules down.</p>`;
  if (view.candidates.length === 0) return `<p class="afc-bay-note">Every module you've researched is already here. Research more AFC modules to fill this bay.</p>`;
  return `<div class="afc-calldown-list">${view.candidates
    .map(
      (candidate) => `<div class="afc-calldown-row is-family-${candidate.family}">
        <div class="afc-calldown-text"><strong>${escapeHtml(candidate.name)}</strong><small>${AFC_MODULE_FAMILY_LABELS[candidate.family]} · ${escapeHtml(candidate.whereLabel)}</small></div>
        <button type="button" class="afc-calldown-btn" data-action="${escapeHtml(candidate.actionId)}">Call down<small>${view.callDownLabel}</small></button>
      </div>`
    )
    .join("")}</div>`;
};

const bayDetailHtml = (view: AfcModuleBaysView, bay: AfcBayView): string => {
  if (bay.state === "empty") {
    return `<div class="afc-bay-detail" data-afc-bay-detail="${bay.index}" hidden>
      <div class="afc-bay-detail-title">Bay ${bay.index + 1} · empty</div>
      ${callDownListHtml(view)}
    </div>`;
  }
  const status = bay.state === "incoming" ? `${STATUS_TEXT.incoming} · ${bay.remainingLabel ?? ""}` : STATUS_TEXT[bay.state];
  return `<div class="afc-bay-detail is-family-${bay.family ?? "other"}" data-afc-bay-detail="${bay.index}" hidden>
    <div class="afc-bay-detail-title">${escapeHtml(bay.name ?? "")}</div>
    <div class="afc-bay-detail-meta"><span class="afc-bay-family">${AFC_MODULE_FAMILY_LABELS[bay.family ?? "other"]}</span> Bay ${bay.index + 1} · ${escapeHtml(status)}</div>
    ${bay.description ? `<p class="afc-bay-detail-desc">${escapeHtml(bay.description)}</p>` : ""}
  </div>`;
};

/** Body of the AFC "Modules" tile-menu tab (docs/manifest-afc-module-bays-plan.md). */
export const afcModuleBaysHtml = (view: AfcModuleBaysView | undefined): string => {
  if (!view) return `<div class="tile-menu-empty">No Fabrication Complex here.</div>`;
  const summary = `${view.usedCount}/${AFC_MODULE_BAY_COUNT} bays in use${view.incomingCount > 0 ? ` · ${view.incomingCount} incoming` : ""}`;
  const hint = view.isOwner && view.usedCount < AFC_MODULE_BAY_COUNT ? "Tap a module to see what it does, or an empty bay to call one down." : "Tap a module to see what it does.";
  const overflowHtml =
    view.overflow.length > 0
      ? `<div class="afc-bays-overflow"><div class="afc-bay-detail-title">Beyond the ${AFC_MODULE_BAY_COUNT} bays</div>${view.overflow
          .map((bay) => `<div class="afc-calldown-text is-family-${bay.family ?? "other"}"><strong>${escapeHtml(bay.name ?? "")}</strong><small>${escapeHtml(bay.description ?? "")}</small></div>`)
          .join("")}</div>`
      : "";
  return `<div class="afc-bays${view.dormant ? " is-dormant" : ""}" data-afc-bays>
    <div class="afc-bays-summary">${summary}${view.dormant ? ` · <span class="tile-overview-dormant">Dormant — modules inactive until reclaimed</span>` : ""}</div>
    <div class="afc-bays-diagram">${diagramSvg()}<div class="afc-bays-hub-label">AFC</div>${view.bays.map(bayButtonHtml).join("")}</div>
    <p class="afc-bays-hint" data-afc-bay-hint>${hint}</p>
    ${view.bays.map((bay) => bayDetailHtml(view, bay)).join("")}
    ${overflowHtml}
  </div>`;
};

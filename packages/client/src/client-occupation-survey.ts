import type { ProspectSignature } from "@border-empires/shared";
import { occupationSurveyStyles } from "./client-occupation-survey-style.js";

export type OccupationSurveyResource = "TITANIUM" | "UMBRITE" | "GEMS";
export type OccupationSurveyReport = {
  id: string;
  resource: OccupationSurveyResource;
  signature: ProspectSignature;
  x: number;
  y: number;
  bearing: string;
  distanceBand: "NEAR" | "MID" | "FAR";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  text: string;
};

type SurveyEventEntry = {
  id: string;
  type: string;
  text: string;
  x?: number;
  y?: number;
  surveyResource?: OccupationSurveyResource;
  surveySignature?: ProspectSignature;
  surveyX?: number;
  surveyY?: number;
  bearing?: string;
  distanceBand?: OccupationSurveyReport["distanceBand"];
  confidence?: OccupationSurveyReport["confidence"];
};

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
type SurveyState = { camX: number; camY: number; camSubX: number; camSubY: number; selected: { x: number; y: number } | undefined; techIds?: readonly string[]; presentationReady?: boolean };

const TECH_BY_RESOURCE: Record<OccupationSurveyResource, string> = { TITANIUM: "masonry", UMBRITE: "leatherworking", GEMS: "crystal-lattices" };
const RESOURCE_LABEL: Record<OccupationSurveyResource, string> = { TITANIUM: "Titanium", UMBRITE: "Umbrite", GEMS: "Crystal" };
const SIGNATURE_LABEL: Record<ProspectSignature, string> = { BLACKWOOD_CANOPY: "Blackwood canopy", FERROUS_DUST: "Ferrous dust", REFRACTIVE_GROUND: "Refractive ground" };

const reportFromEntry = (entry: SurveyEventEntry): OccupationSurveyReport | undefined => {
  if (entry.type !== "OCCUPATION_SURVEY" || !entry.surveyResource || !entry.surveySignature || typeof entry.surveyX !== "number" || typeof entry.surveyY !== "number" || !entry.bearing || !entry.distanceBand || !entry.confidence) return undefined;
  return { id: entry.id, resource: entry.surveyResource, signature: entry.surveySignature, x: entry.surveyX, y: entry.surveyY, bearing: entry.bearing, distanceBand: entry.distanceBand, confidence: entry.confidence, text: entry.text };
};

const reports = new Map<OccupationSurveyResource, OccupationSurveyReport>();
// Exactly three resource keys: deduplication cannot grow with ordinary feed events.
const seenReportIds: Partial<Record<OccupationSurveyResource, string>> = {};
let active: OccupationSurveyReport | undefined;
const queue: OccupationSurveyReport[] = [];
let popupElement: HTMLElement | undefined;
let previousFocus: HTMLElement | undefined;
let viewHandler: ((report: OccupationSurveyReport) => void) | undefined;
let capturePanelOpen = false;
let reportScope: string | undefined;
let revealTechIds: readonly string[] = []; // At most the three resource-reveal techs.

const filterRevealedReports = (techIds: readonly string[]): void => {
  revealTechIds = Object.values(TECH_BY_RESOURCE).filter((id) => techIds.includes(id));
  for (const [resource] of reports) if (revealTechIds.includes(TECH_BY_RESOURCE[resource])) reports.delete(resource);
  queue.splice(0, queue.length, ...queue.filter((report) => !revealTechIds.includes(TECH_BY_RESOURCE[report.resource])));
  if (active && revealTechIds.includes(TECH_BY_RESOURCE[active.resource])) dismissPopup();
};

const ensureStyles = (): void => {
  if (document.getElementById("occupation-survey-styles")) return;
  const style = document.createElement("style");
  style.id = "occupation-survey-styles";
  style.textContent = occupationSurveyStyles;
  document.head.appendChild(style);
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const removePopup = (): void => {
  const restoreFocus = popupElement?.contains(document.activeElement);
  popupElement?.remove();
  popupElement = undefined;
  if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
  previousFocus = undefined;
};
const dismissPopup = (): void => {
  removePopup();
  active = queue.shift();
  if (active && !capturePanelOpen) showPopup(active);
};
const showPopup = (report: OccupationSurveyReport): void => {
  if (typeof document === "undefined" || popupElement?.dataset.reportId === report.id) return;
  removePopup();
  ensureStyles();
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const overlay = document.createElement("div");
  overlay.className = "occupation-survey-overlay";
  overlay.dataset.reportId = report.id;
  overlay.innerHTML = `<section class="occupation-survey-popup" role="dialog" aria-modal="true" aria-labelledby="occupation-survey-title" aria-describedby="occupation-survey-detail">
    <span class="occupation-survey-kicker">Town survey completed</span>
    <h2 id="occupation-survey-title">Signs of ${RESOURCE_LABEL[report.resource]} nearby</h2>
    <p id="occupation-survey-detail">${escapeHtml(SIGNATURE_LABEL[report.signature])} ${escapeHtml(report.bearing.toLowerCase())} of this town indicates likely ${RESOURCE_LABEL[report.resource]}-bearing territory.</p>
    <p class="occupation-survey-hint">Research the resource's Manifest to reveal deposits. This clue is saved in Activity → Yours.</p>
    <div class="occupation-survey-actions"><button type="button" data-survey-view>View survey</button><button type="button" data-survey-dismiss>Got it</button></div>
  </section>`;
  overlay.querySelector<HTMLButtonElement>("[data-survey-view]")?.addEventListener("click", () => {
    viewHandler?.(report);
    dismissPopup();
  });
  overlay.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.addEventListener("click", dismissPopup);
  document.body.appendChild(overlay);
  popupElement = overlay;
  overlay.querySelector<HTMLButtonElement>("[data-survey-view]")?.focus();
};

const presentReports = (incoming: OccupationSurveyReport[]): void => {
  for (const report of incoming) {
    if (active?.id === report.id || queue.some((queued) => queued.id === report.id)) continue;
    if (!active) active = report;
    else {
      const existing = queue.findIndex((queued) => queued.resource === report.resource);
      if (existing >= 0) queue[existing] = report;
      else queue.push(report); // At most one queued report per resource (three).
    }
  }
};

export const occupationSurveyController = {
  record(entry: SurveyEventEntry): void {
    const report = reportFromEntry(entry);
    if (!report || seenReportIds[report.resource] === report.id) return;
    seenReportIds[report.resource] = report.id;
    if (revealTechIds.includes(TECH_BY_RESOURCE[report.resource])) return;
    reports.set(report.resource, report);
    presentReports([report]);
  },
  currentReports(techIds: readonly string[] = []): OccupationSurveyReport[] {
    return [...reports.values()].filter((report) => !techIds.includes(TECH_BY_RESOURCE[report.resource]));
  },
  currentForResource(resource: OccupationSurveyResource): OccupationSurveyReport | undefined { return reports.get(resource); },
  beginCapture(): void {
    capturePanelOpen = true;
    removePopup();
  },
  endCapture(reportsForCapture: OccupationSurveyReport[]): void {
    capturePanelOpen = false;
    presentReports(reportsForCapture.filter((report) => seenReportIds[report.resource] !== report.id));
  },
  sync(state: SurveyState, _worldToScreen: WorldToScreen, _size: number, _halfW: number, _halfH: number): void {
    if (state.techIds) filterRevealedReports(state.techIds);
    if (state.presentationReady === false) { removePopup(); return; }
    if (active && !capturePanelOpen) showPopup(active);
  },
  installViewHandler(handler: (report: OccupationSurveyReport) => void): void { viewHandler = handler; },
  reconcile(entries: readonly SurveyEventEntry[], techIds?: readonly string[], scope?: string): void {
    if (scope !== undefined && scope !== reportScope) {
      this.beginCapture();
      capturePanelOpen = false;
      active = undefined;
      queue.length = 0;
      reports.clear();
      delete seenReportIds.TITANIUM;
      delete seenReportIds.UMBRITE;
      delete seenReportIds.GEMS;
      revealTechIds = [];
      reportScope = scope;
    }
    if (techIds) filterRevealedReports(techIds);
    const currentIds = new Set(entries.filter((entry) => entry.type === "OCCUPATION_SURVEY").map((entry) => entry.id));
    for (const [resource, report] of reports) if (!currentIds.has(report.id)) reports.delete(resource);
    queue.splice(0, queue.length, ...queue.filter((report) => currentIds.has(report.id)));
    if (active && !currentIds.has(active.id)) dismissPopup();
    for (const entry of entries) this.record(entry);
  },
  dismiss: dismissPopup
};

export const occupationSurveyReportsForCapture = (techIds: readonly string[] = []): OccupationSurveyReport[] => occupationSurveyController.currentReports(techIds);
export const techIdForOccupationSurveyResource = (resource: OccupationSurveyResource): string => TECH_BY_RESOURCE[resource];
export const occupationSurveyResourceLabel = (resource: OccupationSurveyResource): string => RESOURCE_LABEL[resource];

if (typeof window !== "undefined") window.addEventListener("keydown", (event) => {
  if (!popupElement) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    dismissPopup();
  } else if (event.key === "Tab") {
    const buttons = Array.from(popupElement.querySelectorAll<HTMLButtonElement>("button"));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}, true);

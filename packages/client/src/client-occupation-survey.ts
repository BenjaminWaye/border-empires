import type { ProspectSignature } from "@border-empires/shared";

export type OccupationSurveyResource = "TITANIUM" | "UMBRITE" | "GEMS";
export type OccupationSurveyReport = {
  id: string;
  resource: OccupationSurveyResource;
  signature: ProspectSignature;
  x: number;
  y: number;
  bearing: string;
  distanceBand: "NEAR" | "MID" | "FAR";
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
};

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
type SurveyState = { camX: number; camY: number; camSubX: number; camSubY: number; selected: { x: number; y: number } | undefined };

const TECH_BY_RESOURCE: Record<OccupationSurveyResource, string> = { TITANIUM: "masonry", UMBRITE: "leatherworking", GEMS: "crystal-lattices" };
const RESOURCE_LABEL: Record<OccupationSurveyResource, string> = { TITANIUM: "Titanium", UMBRITE: "Umbrite", GEMS: "Crystal" };
const SIGNATURE_LABEL: Record<ProspectSignature, string> = { BLACKWOOD_CANOPY: "Blackwood canopy", FERROUS_DUST: "Ferrous dust", REFRACTIVE_GROUND: "Refractive ground" };

const reportFromEntry = (entry: SurveyEventEntry): OccupationSurveyReport | undefined => {
  if (entry.type !== "OCCUPATION_SURVEY" || !entry.surveyResource || !entry.surveySignature || typeof entry.surveyX !== "number" || typeof entry.surveyY !== "number" || !entry.bearing || !entry.distanceBand) return undefined;
  return { id: entry.id, resource: entry.surveyResource, signature: entry.surveySignature, x: entry.surveyX, y: entry.surveyY, bearing: entry.bearing, distanceBand: entry.distanceBand, text: entry.text };
};

const reports = new Map<OccupationSurveyResource, OccupationSurveyReport>();
const seenIds = new Set<string>();
let active: OccupationSurveyReport | undefined;
let activeUntil = 0;
const queue: OccupationSurveyReport[] = [];
let alertElement: HTMLElement | undefined;
let labelElement: HTMLElement | undefined;
let viewHandler: ((report: OccupationSurveyReport) => void) | undefined;
let capturePanelOpen = false;

const ensureStyles = (): void => {
  if (document.getElementById("occupation-survey-styles")) return;
  const style = document.createElement("style");
  style.id = "occupation-survey-styles";
  style.textContent = `
    .occupation-survey-label { position:fixed; z-index:31; width:min(260px,calc(100vw - 32px)); transform:translate(-50%,-100%); padding:10px 13px; border:1px solid rgba(123,205,255,.58); border-radius:10px; background:linear-gradient(145deg,rgba(11,24,37,.96),rgba(18,12,31,.94)); color:#e8f7ff; box-shadow:0 12px 30px rgba(0,0,0,.36),0 0 18px rgba(88,190,255,.16); font:600 12px/1.35 Spectral,serif; cursor:pointer; animation:occupationSurveyIn .22s ease-out both; }
    .occupation-survey-label strong { display:block; margin-bottom:3px; color:#9be3ff; font:800 10px/1.2 'Space Mono',monospace; letter-spacing:.12em; text-transform:uppercase; }
    .occupation-survey-label small { display:block; margin-top:4px; color:rgba(225,242,255,.68); font:600 10px/1.2 'Space Mono',monospace; }
    .occupation-survey-alert { position:fixed; right:18px; bottom:82px; z-index:34; width:min(300px,calc(100vw - 36px)); padding:12px 14px; border:1px solid rgba(255,214,148,.55); border-radius:10px; background:rgba(24,17,10,.96); color:#fbf3e6; box-shadow:0 14px 34px rgba(0,0,0,.34); font:600 12px/1.35 Spectral,serif; }
    .occupation-survey-alert strong { display:block; color:#ffd68f; font:800 10px/1.2 'Space Mono',monospace; letter-spacing:.1em; text-transform:uppercase; }
    .occupation-survey-alert button { margin-top:8px; padding:6px 10px; border:1px solid rgba(255,214,148,.45); border-radius:6px; background:rgba(214,150,68,.18); color:#ffe4b7; font:800 11px 'Space Mono',monospace; cursor:pointer; }
    @keyframes occupationSurveyIn { from { opacity:0; transform:translate(-50%,-88%) scale(.96); } to { opacity:1; transform:translate(-50%,-100%) scale(1); } }
  `;
  document.head.appendChild(style);
};

const clearElement = (element: HTMLElement | undefined): void => { element?.remove(); };
const reportTitle = (report: OccupationSurveyReport): string => `Likely ${RESOURCE_LABEL[report.resource]} territory`;
const reportDetail = (report: OccupationSurveyReport): string => `${SIGNATURE_LABEL[report.signature]} ${report.bearing.toLowerCase()} of this town.`;

const showAlert = (report: OccupationSurveyReport): void => {
  if (typeof document === "undefined") return;
  ensureStyles();
  if (alertElement?.dataset.reportId === report.id) return;
  clearElement(alertElement);
  const element = document.createElement("div");
  element.className = "occupation-survey-alert";
  element.dataset.reportId = report.id;
  element.innerHTML = `<strong>Occupation intelligence received</strong><div>${reportDetail(report)}</div><button type="button">View survey</button>`;
  element.querySelector("button")?.addEventListener("click", () => viewHandler?.(report));
  document.body.appendChild(element);
  alertElement = element;
};

const showLabel = (report: OccupationSurveyReport, screen: { sx: number; sy: number }): void => {
  if (typeof document === "undefined") return;
  ensureStyles();
  if (labelElement?.dataset.reportId === report.id) {
    labelElement.style.left = `${screen.sx}px`;
    labelElement.style.top = `${screen.sy - 8}px`;
    return;
  }
  clearElement(labelElement);
  const element = document.createElement("button");
  element.type = "button";
  element.className = "occupation-survey-label";
  element.dataset.reportId = report.id;
  element.style.left = `${screen.sx}px`;
  element.style.top = `${screen.sy - 8}px`;
  element.innerHTML = `<strong>◈ Occupation survey</strong><div>Local intelligence secured</div><div>${reportTitle(report)}</div><small>${reportDetail(report)} · click to dismiss</small>`;
  element.addEventListener("click", () => dismissLabel());
  document.body.appendChild(element);
  labelElement = element;
};

const advanceQueue = (): void => {
  active = queue.shift();
  activeUntil = active ? Date.now() + 7_000 : 0;
};

const dismissLabel = (): void => {
  clearElement(labelElement);
  labelElement = undefined;
  active = undefined;
  activeUntil = 0;
  if (queue.length > 0) advanceQueue();
};

const presentReports = (incoming: OccupationSurveyReport[]): void => {
  const candidates = incoming.filter((report) => !reports.has(report.resource) || reports.get(report.resource)?.id === report.id);
  if (!active && candidates.length > 0) { active = candidates[0]; activeUntil = Date.now() + 7_000; }
  for (const report of candidates.slice(active === candidates[0] ? 1 : 0)) {
    if (!queue.some((queued) => queued.id === report.id)) queue.push(report);
  }
  if (!active && queue.length > 0) advanceQueue();
};

export const occupationSurveyController = {
  record(entry: SurveyEventEntry): void {
    if (seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    if (entry.type === "TOWN_LOST" && typeof entry.x === "number" && typeof entry.y === "number") {
      for (const [resource, report] of reports) if (report.x === entry.x && report.y === entry.y) reports.delete(resource);
    }
    const report = reportFromEntry(entry);
    if (!report) return;
    reports.set(report.resource, report);
    if (!capturePanelOpen) presentReports([report]);
  },
  currentReports(techIds: readonly string[] = []): OccupationSurveyReport[] {
    return [...reports.values()].filter((report) => !techIds.includes(TECH_BY_RESOURCE[report.resource]));
  },
  currentForResource(resource: OccupationSurveyResource): OccupationSurveyReport | undefined { return reports.get(resource); },
  beginCapture(): void { capturePanelOpen = true; clearElement(alertElement); clearElement(labelElement); alertElement = undefined; labelElement = undefined; },
  endCapture(reportsForCapture: OccupationSurveyReport[]): void { capturePanelOpen = false; active = undefined; activeUntil = 0; presentReports(reportsForCapture); },
  sync(state: SurveyState, worldToScreen: WorldToScreen, size: number, halfW: number, halfH: number): void {
    if (!active) return;
    if (Date.now() >= activeUntil) { dismissLabel(); return; }
    const screen = worldToScreen(active.x, active.y, size, halfW, halfH);
    const onScreen = screen.sx >= -40 && screen.sx <= window.innerWidth + 40 && screen.sy >= -40 && screen.sy <= window.innerHeight + 40;
    if (onScreen) { clearElement(alertElement); alertElement = undefined; showLabel(active, screen); }
    else { clearElement(labelElement); labelElement = undefined; showAlert(active); }
  },
  installViewHandler(handler: (report: OccupationSurveyReport) => void): void { viewHandler = handler; },
  dismiss: dismissLabel
};

export const occupationSurveyReportsForCapture = (techIds: readonly string[] = []): OccupationSurveyReport[] => occupationSurveyController.currentReports(techIds);
export const techIdForOccupationSurveyResource = (resource: OccupationSurveyResource): string => TECH_BY_RESOURCE[resource];
export const occupationSurveyResourceLabel = (resource: OccupationSurveyResource): string => RESOURCE_LABEL[resource];

if (typeof window !== "undefined") window.addEventListener("keydown", (event) => { if (event.key === "Escape") dismissLabel(); });

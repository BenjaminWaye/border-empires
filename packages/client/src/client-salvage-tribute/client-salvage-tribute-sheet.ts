// "Ship salvage to the Court" popup, opened by the tile action and by the
// salvage toasts over the map. Self-contained DOM overlay like the break-pact
// sheet (client-break-pact-sheet.ts), reusing the effort sheet's card styling;
// the confirm button is the gold primary button while there is salvage to ship.
import { SALVAGE_LOADS_PER_SITE } from "@border-empires/shared";
import { keyForTile } from "../client-app-runtime-utils.js";
import type { ClientState } from "../client-state/client-state.js";
import { SALVAGE_LAST_LOAD_NOTE, salvageTributeStatus } from "./client-salvage-tribute.js";
import "./client-salvage-tribute-sheet.css";

type Send = (payload: unknown, message?: string) => boolean;
type SheetState = Pick<ClientState, "me" | "manpower" | "manpowerCap" | "tiles">;

let wired: { state: SheetState; send: Send } | undefined;
let activeSheet: { teardown: () => void } | undefined;

/** Called once at bootstrap so map toasts can open the sheet without their own send plumbing. */
export const installSalvageTributeSheet = (state: SheetState, send: Send): void => { wired = { state, send }; };

export const hideSalvageTributeSheet = (): void => activeSheet?.teardown();

export const isSalvageTributeSheetOpen = (): boolean => activeSheet !== undefined;

/** Shows the popup for the Works at (x, y); returns false when there is nothing to show. */
export const showSalvageTributeSheet = (at: { x: number; y: number }, send: Send | undefined = wired?.send): boolean => {
  const state = wired?.state;
  if (typeof document === "undefined" || !document.body || !state || !send) return false;
  const status = salvageTributeStatus(state, state.tiles.get(keyForTile(at.x, at.y)));
  if (!status) return false;
  hideSalvageTributeSheet();
  let shown = status;
  let closed = false;
  const overlay = document.createElement("div");
  overlay.className = "salvage-sheet-overlay";
  overlay.setAttribute("role", "presentation");
  const card = document.createElement("div");
  card.className = "effort-confirm-card salvage-sheet-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Ship salvage to the Court");
  card.innerHTML = `
    <h3 class="effort-confirm-title">Ship salvage to the Court</h3>
    <p class="effort-confirm-subtitle">Reclamation Works · ${at.x}, ${at.y}</p>
    <dl class="salvage-sheet-facts">
      <div><dt>Delivery</dt><dd data-salvage-delivered></dd></div>
      <div><dt>Loads left</dt><dd data-salvage-loads></dd></div>
    </dl>
    <p class="salvage-sheet-note" data-salvage-note></p>
    <div class="effort-confirm-actions">
      <button type="button" class="effort-confirm-cancel" data-salvage-cancel>Cancel</button>
      <button type="button" class="salvage-sheet-go" data-salvage-go>Ship 1 load</button>
    </div>
  `;
  const set = (selector: string, text: string): void => { const node = card.querySelector(selector); if (node) node.textContent = text; };
  const go = card.querySelector<HTMLButtonElement>("[data-salvage-go]");
  const paint = (): void => {
    const { loads, delivered, reason } = shown;
    set("[data-salvage-delivered]", `+${delivered} manpower`);
    set("[data-salvage-loads]", `${loads} of ${SALVAGE_LOADS_PER_SITE}`);
    set("[data-salvage-note]", reason || (loads === 1 ? SALVAGE_LAST_LOAD_NOTE : ""));
    if (go) go.disabled = Boolean(reason);
    card.querySelector("[data-salvage-note]")?.classList.toggle("is-blocked", Boolean(reason));
  };
  paint();
  overlay.appendChild(card);
  const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") teardown(); };
  const teardown = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    activeSheet = undefined;
  };
  card.querySelector<HTMLButtonElement>("[data-salvage-cancel]")?.addEventListener("click", teardown);
  go?.addEventListener("click", () => {
    if (closed) return;
    // Manpower refills, loads ship elsewhere and tiles change hands while this is open:
    // re-check, and show the new numbers instead of spending a load on stale ones.
    const now = salvageTributeStatus(state, state.tiles.get(keyForTile(at.x, at.y)));
    if (!now) { teardown(); return; }
    const changed = now.loads !== shown.loads || now.delivered !== shown.delivered || now.reason !== shown.reason;
    shown = now;
    if (changed || now.reason) { paint(); return; }
    teardown();
    send({ type: "SHIP_SALVAGE_TO_COURT", x: at.x, y: at.y }, "Finish sign-in before shipping salvage.");
  });
  // Clicking the dimmed backdrop backs out, like Escape.
  overlay.addEventListener("click", (event) => { if (event.target === overlay) teardown(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  activeSheet = { teardown };
  (go && !go.disabled ? go : card.querySelector<HTMLButtonElement>("[data-salvage-cancel]"))?.focus();
  return true;
};

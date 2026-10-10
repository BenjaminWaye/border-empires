import { MUSTER_COMMIT_PRESET_MULTIPLIERS, musterCommitPresetAmount, type MusterCommitPreset } from "../client-muster-commit-tab/client-muster-commit-tab.js";

// The effort-level (Normal / Extra / Double, per docs/replenishment-update-
// plan.md D6) confirm sheet shared by every "commit manpower to a fight"
// entry point: March To (client-arrow-gesture-confirm-sheet.ts), Launch
// Attack and Expand To & Attack (client-launch-attack-effort.ts). Self-
// contained DOM overlay mounted on document.body and torn down on dismiss --
// same pattern as client-trickle-pick-modal.ts -- rather than reusing the
// tile-menu element, since the target tile may be off-screen. At most one
// sheet is shown at a time; opening a new one closes the previous one
// (calling its onCancel).

export type EffortConfirmSheetOptions = {
  title: string;
  subtitle?: string;
  /** Minimum commitment for one attack -- the target's own muster floor. */
  floor: number;
  /** Slider maximum (the player's whole manpower pool, same as the muster commit tab). */
  cap: number;
  /**
   * "slider": an absolute-manpower slider plus preset buttons, for one target.
   * "presets": preset buttons only, for several targets with different
   * floors -- the caller applies the chosen preset's multiplier per target.
   */
  mode: "slider" | "presets";
  confirmLabel?: string;
  /** Live info line under the controls (e.g. win chance); re-run on every change and on a short timer. */
  describe?: (commitManpower: number, preset: MusterCommitPreset | undefined) => string;
  onChange?: (commitManpower: number) => void;
  /** `preset` is undefined when the player dragged the slider off a preset. */
  onConfirm: (commitManpower: number, preset: MusterCommitPreset | undefined) => void;
  onCancel?: () => void;
};

export type EffortConfirmSheetHandle = { close: () => void };

const PRESET_LABELS: Record<MusterCommitPreset, string> = { normal: "Normal", extra: "Extra", double: "Double" };
const DESCRIBE_REFRESH_MS = 400;

let activeSheet: { overlay: HTMLDivElement; teardown: () => void } | undefined;

/** Closes whichever effort sheet is open, without confirming. Safe to call when none is shown. */
export const hideEffortConfirmSheet = (): void => {
  activeSheet?.teardown();
};

export const isEffortConfirmSheetOpen = (): boolean => activeSheet !== undefined;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

const presetAmounts = (floor: number, cap: number): Array<{ key: MusterCommitPreset; amount: number }> =>
  (Object.keys(MUSTER_COMMIT_PRESET_MULTIPLIERS) as MusterCommitPreset[]).map((key) => ({
    key,
    amount: Math.min(cap, musterCommitPresetAmount(key, floor))
  }));

export const showEffortConfirmSheet = (options: EffortConfirmSheetOptions): EffortConfirmSheetHandle | undefined => {
  if (typeof document === "undefined" || !document.body) return undefined;
  hideEffortConfirmSheet();

  const floor = Math.max(1, options.floor);
  const cap = Math.max(floor, options.cap);
  const presets = presetAmounts(floor, cap);
  let commitManpower = floor;
  let preset: MusterCommitPreset | undefined = "normal";
  let closed = false;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const overlay = document.createElement("div");
  overlay.className = "effort-confirm-overlay";
  overlay.setAttribute("role", "presentation");
  overlay.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:flex-end;justify-content:flex-end;max-width:calc(100vw - 32px)";

  const card = document.createElement("div");
  card.className = "effort-confirm-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-label", options.title);
  card.style.cssText =
    "width:280px;max-width:100%;box-sizing:border-box;padding:14px 16px;background:#161b29;color:#e6e9f2;border:1px solid #2a3247;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,0.55);font-family:inherit";

  const presetButtonStyle = "flex:1;padding:6px 0;background:#1c2335;border:1px solid #2a3247;color:#e6e9f2;border-radius:6px;cursor:pointer;font-size:12px;";
  card.innerHTML = `
    <h3 style="margin:0 0 6px;font-size:14px;letter-spacing:0.01em;">${escapeHtml(options.title)}</h3>
    ${options.subtitle ? `<p style="margin:0 0 10px;color:#9aa6c2;font-size:12px;line-height:1.4;">${escapeHtml(options.subtitle)}</p>` : ""}
    ${
      options.mode === "slider"
        ? `<input type="range" data-effort-slider aria-label="Manpower to commit" min="${floor}" max="${cap}" value="${commitManpower}" style="width:100%;" />
    <div style="display:flex;justify-content:space-between;margin:2px 0 10px;font-size:12px;color:#9aa6c2;">
      <span>Manpower: <span data-effort-value>${commitManpower}</span></span>
    </div>`
        : ""
    }
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      ${presets
        .map(({ key, amount }) => `<button type="button" data-effort-preset="${key}" data-effort-amount="${amount}" style="${presetButtonStyle}">${PRESET_LABELS[key]}</button>`)
        .join("")}
    </div>
    <p data-effort-info style="margin:0 0 12px;min-height:16px;font-size:12px;color:#c9d2e8;line-height:1.4;"></p>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button type="button" data-effort-cancel style="padding:8px 14px;background:transparent;border:1px solid #2a3247;color:#9aa6c2;border-radius:6px;cursor:pointer;">Cancel</button>
      <button type="button" data-effort-go style="padding:8px 14px;background:#3a5286;border:1px solid #3a5286;color:#fff;border-radius:6px;cursor:pointer;">${escapeHtml(options.confirmLabel ?? "Go")}</button>
    </div>
  `;
  overlay.appendChild(card);

  const slider = card.querySelector<HTMLInputElement>("[data-effort-slider]");
  const valueEl = card.querySelector<HTMLElement>("[data-effort-value]");
  const infoEl = card.querySelector<HTMLElement>("[data-effort-info]");
  const presetButtons = Array.from(card.querySelectorAll<HTMLButtonElement>("[data-effort-preset]"));

  const refresh = (): void => {
    if (slider) slider.value = String(commitManpower);
    if (valueEl) valueEl.textContent = String(commitManpower);
    for (const btn of presetButtons) {
      const selected = btn.dataset.effortPreset === preset;
      btn.setAttribute("aria-pressed", String(selected));
      btn.style.background = selected ? "#3a5286" : "#1c2335";
      btn.style.borderColor = selected ? "#5b78b8" : "#2a3247";
    }
    if (infoEl && options.describe) infoEl.textContent = options.describe(commitManpower, preset);
  };
  const changed = (): void => {
    refresh();
    options.onChange?.(commitManpower);
  };

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    if (refreshTimer) clearInterval(refreshTimer);
    document.removeEventListener("keydown", onKey);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (activeSheet?.overlay === overlay) activeSheet = undefined;
  };
  const cancel = (): void => {
    if (closed) return;
    teardown();
    options.onCancel?.();
  };
  const confirm = (): void => {
    if (closed) return;
    teardown();
    options.onConfirm(commitManpower, preset);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") cancel();
    else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      confirm();
    }
  };

  if (slider) {
    slider.oninput = () => {
      commitManpower = Number(slider.value);
      preset = presets.find((p) => p.amount === commitManpower)?.key;
      changed();
    };
  }
  for (const btn of presetButtons) {
    btn.onclick = () => {
      const amount = Number(btn.dataset.effortAmount);
      if (!Number.isFinite(amount)) return;
      commitManpower = amount;
      preset = btn.dataset.effortPreset as MusterCommitPreset;
      changed();
    };
  }
  card.querySelector<HTMLButtonElement>("[data-effort-cancel]")?.addEventListener("click", cancel);
  const goBtn = card.querySelector<HTMLButtonElement>("[data-effort-go]");
  goBtn?.addEventListener("click", confirm);

  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  activeSheet = { overlay, teardown: cancel };
  refresh();
  options.onChange?.(commitManpower);
  if (options.describe) refreshTimer = setInterval(refresh, DESCRIBE_REFRESH_MS);
  goBtn?.focus();
  return { close: cancel };
};

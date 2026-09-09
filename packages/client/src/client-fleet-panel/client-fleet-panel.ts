// DOM/network wiring for the Space View Fleet panel (galactic v1 backend --
// see docs/galactic-campaign-design.md §6/§12 v2a, and PR #1847 for the
// routes this drives). Kept separate from client-fleet-panel-html.ts (pure
// HTML) the same way client-senate-panel.ts is split from its HTML module.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import {
  fleetPanelHtml,
  fleetBlueprintListHtml,
  fleetOrderListHtml,
  fleetBattleLogHtml,
  fleetThreatListHtml,
  fleetTargetOptionsHtml,
  fleetCompositionSummaryHtml,
  FLEET_HULL_CLASS_IDS,
  type FleetHullClassId,
  type FleetTargetOption,
  type FleetBlueprintView,
  type FleetOrderView,
  type FleetBattleLogEntryView,
  type FleetThreatView
} from "./client-fleet-panel-html.js";

type RawFleetComposition = Partial<Record<FleetHullClassId, number>>;
type RawFleetBlueprint = { id: string; name: string; composition: RawFleetComposition; weaponEmphasis: string };
type RawFleetOrderOutcome = { reconOnly: boolean; netDamage: number; stabilityAfter: number; revealedGarrison?: number; garrisoned?: boolean };
type RawFleetOrder = {
  id: string;
  targetSeasonId: string;
  orderKind?: "RAID" | "GARRISON";
  status: "TRAVELING" | "RESOLVED";
  // Undefined on an order created before this field existed -- treated as
  // having departed immediately (see GalaxyFleetOrder.departsAt's comment).
  departsAt?: number;
  arrivesAt: number;
  outcome?: RawFleetOrderOutcome;
};
type RawFleetBattleLogEntry = {
  attackerAuthUid: string;
  defenderAuthUid: string;
  targetSeasonId: string;
  reconOnly: boolean;
  netDamage: number;
  stabilityAfter: number;
  resolvedAt: number;
};
type RawFleetThreat = { id: string; targetSeasonId: string; arrivesAt: number };

export type FleetPanelDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  // Candidate raid targets: every publicly-held territory except the
  // caller's own -- same list Space View already builds for the Senate
  // panel, handed in rather than re-fetched.
  getTargetOptions: () => FleetTargetOption[];
  // The caller's own held territories -- offered as a separate "hold at
  // home" optgroup in the target picker. Sending to one of these becomes a
  // GARRISON order server-side (no combat), purely from targetSeasonId
  // resolving to the sender's own territory -- see galaxy-fleet-routes.ts.
  // Optional/defaults to none so an existing caller that hasn't wired this
  // up yet just doesn't get the "hold at home" option.
  getHomeOptions?: () => FleetTargetOption[];
};

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  401: "You must be signed in to use Fleets.",
  402: "Not enough Production for this fleet.",
  404: "That target is not a currently held territory.",
  409: "This action could not be completed."
};

const outcomeSummary = (outcome?: RawFleetOrderOutcome): string | undefined => {
  if (!outcome) return undefined;
  if (outcome.garrisoned) return "Garrisoned at home.";
  if (outcome.reconOnly) return `Recon: revealed ${outcome.revealedGarrison ?? 0} Garrison`;
  return `Dealt ${outcome.netDamage} net damage, Stability now ${outcome.stabilityAfter}`;
};

export const mountFleetPanel = (container: HTMLElement, deps: FleetPanelDeps): { refresh: () => Promise<void> } => {
  const authHeader = async (): Promise<Record<string, string> | undefined> => {
    const token = await deps.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const showMessage = (text: string): void => {
    const el = container.querySelector<HTMLParagraphElement>("[data-fleet-message]");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  };

  const readComposition = (): RawFleetComposition => {
    const composition: RawFleetComposition = {};
    for (const hullId of FLEET_HULL_CLASS_IDS) {
      const input = container.querySelector<HTMLInputElement>(`[data-fleet-hull-count="${hullId}"]`);
      const count = input ? Number(input.value) : 0;
      if (count > 0) composition[hullId] = count;
    }
    return composition;
  };

  const renderSummary = (): void => {
    const summaryEl = container.querySelector<HTMLDivElement>("[data-fleet-summary]");
    if (summaryEl) summaryEl.innerHTML = fleetCompositionSummaryHtml(readComposition());
    container.querySelectorAll<HTMLElement>("[data-fleet-hull-card]").forEach((card) => {
      const hullId = card.dataset.fleetHullCard as FleetHullClassId | undefined;
      const count = hullId ? (readComposition()[hullId] ?? 0) : 0;
      card.classList.toggle("fl-hull-card-active", count > 0);
    });
  };

  const setHullCount = (hullId: FleetHullClassId, count: number): void => {
    const input = container.querySelector<HTMLInputElement>(`[data-fleet-hull-count="${hullId}"]`);
    if (input) input.value = String(Math.max(0, count));
    renderSummary();
  };

  const fetchBlueprints = async (): Promise<RawFleetBlueprint[]> => {
    const headers = await authHeader();
    if (!headers) return [];
    const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/blueprints`, { headers: { ...headers, Accept: "application/json" } });
    if (!response.ok) return [];
    const body = (await response.json().catch(() => undefined)) as { blueprints?: RawFleetBlueprint[] } | undefined;
    return body?.blueprints ?? [];
  };

  const fetchOrders = async (): Promise<RawFleetOrder[]> => {
    const headers = await authHeader();
    if (!headers) return [];
    const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets`, { headers: { ...headers, Accept: "application/json" } });
    if (!response.ok) return [];
    const body = (await response.json().catch(() => undefined)) as { orders?: RawFleetOrder[] } | undefined;
    return body?.orders ?? [];
  };

  const fetchBattleLog = async (): Promise<RawFleetBattleLogEntry[]> => {
    const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/log`, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const body = (await response.json().catch(() => undefined)) as { entries?: RawFleetBattleLogEntry[] } | undefined;
    return body?.entries ?? [];
  };

  const fetchThreats = async (): Promise<RawFleetThreat[]> => {
    const headers = await authHeader();
    if (!headers) return [];
    const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/incoming`, { headers: { ...headers, Accept: "application/json" } });
    if (!response.ok) return [];
    const body = (await response.json().catch(() => undefined)) as { threats?: RawFleetThreat[] } | undefined;
    return body?.threats ?? [];
  };

  const renderBlueprints = (blueprints: RawFleetBlueprint[]): void => {
    const container_ = container.querySelector<HTMLDivElement>("[data-fleet-blueprints]");
    if (!container_) return;
    const views: FleetBlueprintView[] = blueprints.map((b) => ({ id: b.id, name: b.name, composition: b.composition, weaponEmphasis: b.weaponEmphasis }));
    container_.innerHTML = fleetBlueprintListHtml(views);
  };

  const targetLabelFor = (seasonId: string): string =>
    deps.getTargetOptions().find((t) => t.seasonId === seasonId)?.label ?? deps.getHomeOptions?.().find((t) => t.seasonId === seasonId)?.label ?? seasonId;

  const renderOrders = (orders: RawFleetOrder[]): void => {
    const container_ = container.querySelector<HTMLDivElement>("[data-fleet-orders]");
    if (!container_) return;
    const now = Date.now();
    const views: FleetOrderView[] = orders.map((o) => {
      const summary = outcomeSummary(o.outcome);
      const departsAt = o.departsAt ?? o.arrivesAt; // pre-build-time order: treat as having departed immediately
      const status: FleetOrderView["status"] = o.status === "RESOLVED" ? "RESOLVED" : now < departsAt ? "BUILDING" : "TRAVELING";
      return {
        id: o.id,
        targetLabel: targetLabelFor(o.targetSeasonId),
        status,
        departsAt,
        arrivesAt: o.arrivesAt,
        ...(summary ? { outcomeSummary: summary } : {}),
        ...(o.outcome ? { reconOnly: o.outcome.reconOnly } : {}),
        garrison: o.orderKind === "GARRISON" || o.outcome?.garrisoned === true
      };
    });
    container_.innerHTML = fleetOrderListHtml(views);
  };

  const renderBattleLog = (entries: RawFleetBattleLogEntry[]): void => {
    const container_ = container.querySelector<HTMLDivElement>("[data-fleet-log]");
    if (!container_) return;
    const views: FleetBattleLogEntryView[] = entries.map((e) => ({
      attackerLabel: e.attackerAuthUid,
      defenderLabel: targetLabelFor(e.targetSeasonId),
      summary: e.reconOnly ? "Recon: Garrison revealed" : `${e.netDamage} dmg -> Stability ${e.stabilityAfter}`,
      resolvedAt: e.resolvedAt,
      reconOnly: e.reconOnly
    }));
    container_.innerHTML = fleetBattleLogHtml(views);
  };

  const renderThreats = (threats: RawFleetThreat[]): void => {
    const section = container.querySelector<HTMLDivElement>("[data-fleet-threats-section]");
    const container_ = container.querySelector<HTMLDivElement>("[data-fleet-threats]");
    if (!section || !container_) return;
    const views: FleetThreatView[] = threats.map((t) => ({ targetLabel: targetLabelFor(t.targetSeasonId), arrivesAt: t.arrivesAt }));
    container_.innerHTML = fleetThreatListHtml(views);
    section.hidden = views.length === 0;
  };

  const refresh = async (): Promise<void> => {
    const targetGroup = container.querySelector<HTMLOptGroupElement>("[data-fleet-target-select] optgroup:last-of-type");
    if (targetGroup) targetGroup.innerHTML = fleetTargetOptionsHtml(deps.getTargetOptions());
    const homeGroup = container.querySelector<HTMLOptGroupElement>("[data-fleet-home-optgroup]");
    if (homeGroup) {
      const homeOptions = deps.getHomeOptions?.() ?? [];
      homeGroup.innerHTML = fleetTargetOptionsHtml(homeOptions);
      homeGroup.hidden = homeOptions.length === 0;
    }
    const [blueprints, orders, log, threats] = await Promise.all([fetchBlueprints(), fetchOrders(), fetchBattleLog(), fetchThreats()]);
    renderBlueprints(blueprints);
    renderOrders(orders);
    renderBattleLog(log);
    renderThreats(threats);
  };

  container.innerHTML = fleetPanelHtml(fleetTargetOptionsHtml(deps.getTargetOptions()), fleetTargetOptionsHtml(deps.getHomeOptions?.() ?? []));
  void refresh();

  // Hull counts are steppers (+/-) plus a manually-editable number input,
  // both backed by the same hidden [data-fleet-hull-count] input -- the
  // live cost/damage/travel-time summary re-renders on any change to it.
  container.addEventListener("click", (event) => {
    const stepBtn = (event.target as HTMLElement).closest<HTMLElement>("[data-fleet-hull-step]");
    if (!stepBtn) return;
    const hullId = stepBtn.dataset.fleetHullStep as FleetHullClassId;
    const dir = Number(stepBtn.dataset.fleetHullStepDir ?? "0");
    const input = container.querySelector<HTMLInputElement>(`[data-fleet-hull-count="${hullId}"]`);
    setHullCount(hullId, Number(input?.value ?? 0) + dir);
  });
  container.addEventListener("input", (event) => {
    if ((event.target as HTMLElement).matches("[data-fleet-hull-count]")) renderSummary();
  });

  const saveBlueprint = async (): Promise<RawFleetBlueprint | undefined> => {
    const nameInput = container.querySelector<HTMLInputElement>("[data-fleet-blueprint-name]");
    const name = nameInput?.value.trim();
    if (!name) return undefined;
    const composition = readComposition();
    const weaponEmphasis = container.querySelector<HTMLSelectElement>("[data-fleet-weapon-select]")?.value;
    const headers = await authHeader();
    if (!headers) {
      showMessage(HTTP_ERROR_MESSAGES[401] ?? "You must be signed in to use Fleets.");
      return undefined;
    }
    const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/blueprints`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name, composition, weaponEmphasis })
    });
    if (!response.ok) {
      showMessage(HTTP_ERROR_MESSAGES[response.status] ?? "Could not save this blueprint.");
      return undefined;
    }
    const body = (await response.json().catch(() => undefined)) as { blueprint?: RawFleetBlueprint } | undefined;
    return body?.blueprint;
  };

  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-fleet-save-blueprint]")) {
      void (async () => {
        showMessage("");
        const saved = await saveBlueprint();
        if (saved) {
          showMessage("Blueprint saved.");
          await refresh();
        }
      })();
      return;
    }
    const deleteBtn = target.closest("[data-fleet-delete-blueprint]");
    if (deleteBtn) {
      const id = deleteBtn.closest<HTMLElement>("[data-fleet-blueprint-id]")?.dataset.fleetBlueprintId;
      if (!id) return;
      void (async () => {
        const headers = await authHeader();
        if (!headers) return;
        await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/blueprints/${id}`, { method: "DELETE", headers });
        await refresh();
      })();
      return;
    }
    const loadBtn = target.closest("[data-fleet-load-blueprint]");
    if (loadBtn) {
      const id = loadBtn.closest<HTMLElement>("[data-fleet-blueprint-id]")?.dataset.fleetBlueprintId;
      void (async () => {
        const blueprints = await fetchBlueprints();
        const blueprint = blueprints.find((b) => b.id === id);
        if (!blueprint) return;
        for (const hullId of FLEET_HULL_CLASS_IDS) {
          const input = container.querySelector<HTMLInputElement>(`[data-fleet-hull-count="${hullId}"]`);
          if (input) input.value = String(blueprint.composition[hullId] ?? 0);
        }
        renderSummary();
        const weaponSelect = container.querySelector<HTMLSelectElement>("[data-fleet-weapon-select]");
        if (weaponSelect) weaponSelect.value = blueprint.weaponEmphasis;
      })();
    }
  });

  container.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement).closest("[data-fleet-send-form]");
    if (!form) return;
    event.preventDefault();
    void (async () => {
      showMessage("");
      const targetSeasonId = container.querySelector<HTMLSelectElement>("[data-fleet-target-select]")?.value;
      const weaponEmphasis = container.querySelector<HTMLSelectElement>("[data-fleet-weapon-select]")?.value;
      const composition = readComposition();
      if (!targetSeasonId || !weaponEmphasis || Object.keys(composition).length === 0) {
        showMessage("Pick a target and at least one hull.");
        return;
      }
      const headers = await authHeader();
      if (!headers) {
        showMessage(HTTP_ERROR_MESSAGES[401] ?? "You must be signed in to use Fleets.");
        return;
      }
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}/hq/galaxy/fleets/send`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ targetSeasonId, composition, weaponEmphasis })
      });
      if (!response.ok) {
        showMessage(HTTP_ERROR_MESSAGES[response.status] ?? "Could not send this fleet.");
        return;
      }
      showMessage("Fleet sent.");
      await refresh();
    })();
  });

  return { refresh };
};

import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { ActiveTruceView } from "./client-types.js";

type PlayerActionDeps = Record<string, any> & {
  state: ClientState;
  techPickEl: HTMLSelectElement;
  mobileTechPickEl: HTMLSelectElement;
  ws: WebSocket;
  wsUrl: string;
  setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  syncAuthOverlay: () => void;
  pushFeed: (...args: any[]) => void;
  renderHud: () => void;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
};

export const sendAllianceRequestFromUi = (target: string, deps: PlayerActionDeps): void => {
  const trimmed = target.trim();
  if (!trimmed) return;
  deps.sendGameMessage({ type: "ALLIANCE_REQUEST", targetPlayerName: trimmed }, "Finish sign-in before sending alliance requests.");
};

export const sendTruceRequestFromUi = (targetPlayerName: string, durationHours: 12 | 24, deps: PlayerActionDeps): void => {
  const trimmed = targetPlayerName.trim();
  if (!trimmed) return;
  deps.sendGameMessage({ type: "TRUCE_REQUEST", targetPlayerName: trimmed, durationHours }, "Finish sign-in before sending truce offers.");
};

export const breakAllianceFromUi = (target: string, deps: PlayerActionDeps): void => {
  const trimmed = target.trim();
  if (!trimmed) return;
  deps.sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: trimmed }, "Finish sign-in before breaking alliances.");
};

export const breakTruceFromUi = (targetPlayerId: string, deps: PlayerActionDeps): void => {
  const trimmed = targetPlayerId.trim();
  if (!trimmed) return;
  deps.sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: trimmed }, "Finish sign-in before breaking truces.");
};

export const activeTruceWithPlayerFromState = (state: ClientState, playerId?: string | null): ActiveTruceView | undefined =>
  playerId ? state.activeTruces.find((truce) => truce.otherPlayerId === playerId && truce.endsAt > Date.now()) : undefined;

export const currentTechPickIdFromUi = (state: ClientState, techPickEl: HTMLSelectElement, mobileTechPickEl: HTMLSelectElement): string => {
  const byState = state.techUiSelectedId?.trim();
  if (byState) return byState;
  const byDesktop = techPickEl.value?.trim();
  if (byDesktop) return byDesktop;
  const byMobile = mobileTechPickEl.value?.trim();
  if (byMobile) return byMobile;
  return "";
};

export const chooseTechFromUi = (techIdRaw: string | undefined, deps: PlayerActionDeps): void => {
  const websocketOpenReadyState = typeof WebSocket !== "undefined" ? WebSocket.OPEN : 1;
  const techId = (techIdRaw ?? "").trim() || currentTechPickIdFromUi(deps.state, deps.techPickEl, deps.mobileTechPickEl);
  if (!techId) {
    console.error("[tech] choose blocked: empty tech id", {
      stateTechUiSelectedId: deps.state.techUiSelectedId,
      desktopValue: deps.techPickEl.value,
      mobileValue: deps.mobileTechPickEl.value,
      choices: deps.state.techChoices
    });
    deps.pushFeed("No tech selected.", "tech", "warn");
    return;
  }
  if (deps.ws.readyState !== websocketOpenReadyState) {
    console.error("[tech] choose blocked: websocket not open", { techId, readyState: deps.ws.readyState, wsUrl: deps.wsUrl });
    deps.pushFeed("Cannot choose tech while disconnected.", "tech", "error");
    return;
  }
  if (!deps.state.authSessionReady) {
    deps.setAuthStatus("Finish sign-in before choosing a technology.", "error");
    deps.syncAuthOverlay();
    return;
  }
  if (deps.state.pendingTechUnlockId) {
    deps.pushFeed("Already unlocking a technology. Waiting for server confirmation...", "tech", "warn");
    return;
  }
  const tech = deps.state.techCatalog.find((item) => item.id === techId);
  if (!tech) {
    deps.pushFeed("That technology is no longer available.", "tech", "warn");
    return;
  }
  deps.state.techUiSelectedId = techId;
  deps.state.pendingTechUnlockId = techId;
  console.info("[tech] sending CHOOSE_TECH", { techId });
  deps.ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
  deps.pushFeed(`Unlocking: ${tech.name}.`, "tech", "info");
  deps.renderHud();
};

export const chooseDomainFromUi = (domainIdRaw: string | undefined, deps: PlayerActionDeps): void => {
  const websocketOpenReadyState = typeof WebSocket !== "undefined" ? WebSocket.OPEN : 1;
  const domainId = (domainIdRaw ?? "").trim() || deps.state.domainUiSelectedId?.trim() || deps.state.domainChoices[0] || "";
  if (!domainId) {
    deps.pushFeed("No domain selected.", "tech", "warn");
    return;
  }
  if (deps.ws.readyState !== websocketOpenReadyState) {
    deps.pushFeed("Cannot choose a domain while disconnected.", "tech", "error");
    return;
  }
  if (!deps.state.authSessionReady) {
    deps.setAuthStatus("Finish sign-in before choosing a domain.", "error");
    deps.syncAuthOverlay();
    return;
  }
  if (deps.state.pendingDomainUnlockId) {
    deps.pushFeed("Already sending a domain choice. Waiting for server confirmation...", "tech", "warn");
    return;
  }
  const domain = deps.state.domainCatalog.find((item) => item.id === domainId);
  if (!domain) {
    deps.pushFeed("That domain is no longer available.", "tech", "warn");
    return;
  }
  deps.state.domainUiSelectedId = domainId;
  deps.state.pendingDomainUnlockId = domainId;
  deps.ws.send(JSON.stringify({ type: "CHOOSE_DOMAIN", domainId }));
  deps.pushFeed(`Choosing domain: ${domain.name}.`, "tech", "info");
  deps.renderHud();
};

export const explainActionFailureFromServer = (
  code: string,
  message: string,
  opts?: { cooldownRemainingMs?: number; formatCooldownShort?: (ms: number) => string }
): string => {
  if (code === "INSUFFICIENT_GOLD") return `Action blocked: ${message}.`;
  if (code === "SETTLE_INVALID") return `Cannot settle: ${message}.`;
  if (code === "FORT_BUILD_INVALID") return `Cannot build fort: ${message}.`;
  if (code === "OBSERVATORY_BUILD_INVALID") return `Cannot build observatory: ${message}.`;
  if (code === "SIEGE_OUTPOST_BUILD_INVALID") return `Cannot build siege outpost: ${message}.`;
  if (code === "ECONOMIC_STRUCTURE_BUILD_INVALID") return `Cannot build structure: ${message}.`;
  if (code === "STRUCTURE_REMOVE_INVALID") return `Cannot remove structure: ${message}.`;
  if (code === "REVEAL_EMPIRE_INVALID") return `Cannot reveal empire: ${message}.`;
  if (code === "SIPHON_INVALID") return `Cannot siphon tile: ${message}.`;
  if (code === "PURGE_SIPHON_INVALID") return `Cannot purge siphon: ${message}.`;
  if (code === "AETHER_BRIDGE_INVALID") return `Cannot cast Aether Bridge: ${message}.`;
  if (code === "CREATE_MOUNTAIN_INVALID") return `Cannot create mountain: ${message}.`;
  if (code === "REMOVE_MOUNTAIN_INVALID") return `Cannot remove mountain: ${message}.`;
  if (code === "NOT_ADJACENT") return "Action blocked: target must border your territory or a linked dock.";
  if (code === "NOT_OWNER") return "Action blocked: you need to launch from one of your own tiles.";
  if (code === "ATTACK_COOLDOWN") {
    const remainingMs = Math.max(0, opts?.cooldownRemainingMs ?? 0);
    if (remainingMs <= 0) return "Action blocked: that origin tile is still on attack cooldown.";
    const remainingLabel = opts?.formatCooldownShort ? opts.formatCooldownShort(remainingMs) : `${Math.ceil(remainingMs / 1000)}s`;
    return `Action blocked: that origin tile is still on attack cooldown for ${remainingLabel}.`;
  }
  if (code === "LOCKED") return "Action blocked: the tile is already in combat.";
  if (code === "BARRIER") return "Action blocked: only land tiles can be claimed or attacked.";
  if (code === "SHIELDED") return "Action blocked: that empire is still under spawn protection.";
  if (code === "ALLY_TARGET") return "Action blocked: you cannot attack an allied or truced empire.";
  if (code === "BREAKTHROUGH_TARGET_INVALID") return `Cannot launch breach attack: ${message}.`;
  if (code === "EXPAND_TARGET_OWNED") return "Frontier claim failed: that tile is already owned.";
  if (message.includes("development slots are busy")) {
    return `Cannot start development: ${message}. You can run up to ${DEVELOPMENT_PROCESS_LIMIT} at once.`;
  }
  return `Error ${code}: ${message}`;
};

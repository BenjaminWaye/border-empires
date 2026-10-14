import type { AllianceRequest, TruceRequest } from "../client-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type { initClientDom } from "../client-dom.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { applySocialFocus } from "../client-alliance/client-alliance-focus.js";
import { alliancePanelHtml } from "../client-alliance/client-alliance-panel.js";
import { alliancePanelInputFromState } from "../client-alliance/client-alliance-panel-input.js";

type AllianceDom = Pick<ReturnType<typeof initClientDom>, "alliesListEl" | "mobileAlliesListEl">;
type SafeValue = <T>(label: string, fallback: T, render: () => T) => T;

const displayRequestNames = <T extends AllianceRequest | TruceRequest>(state: ClientState, requests: T[]): T[] =>
  requests.map((request) => ({
    ...request,
    fromName: playerDisplayNameForOwnerFromState(state, request.fromPlayerId) ?? request.fromName,
    toName: playerDisplayNameForOwnerFromState(state, request.toPlayerId) ?? request.toName
  }));

export const renderAllianceLists = (
  state: ClientState,
  dom: AllianceDom,
  safeValue: SafeValue,
  fallback: string
): void => {
  dom.alliesListEl.innerHTML = safeValue("alliancePanelHtml", fallback, () =>
    alliancePanelHtml({
      ...alliancePanelInputFromState(state, (id) => playerDisplayNameForOwnerFromState(state, id), Date.now()),
      incomingAllianceRequests: displayRequestNames(state, state.incomingAllianceRequests),
      outgoingAllianceRequests: displayRequestNames(state, state.outgoingAllianceRequests),
      incomingTruceRequests: displayRequestNames(state, state.incomingTruceRequests),
      outgoingTruceRequests: displayRequestNames(state, state.outgoingTruceRequests)
    })
  );
  dom.mobileAlliesListEl.innerHTML = dom.alliesListEl.innerHTML;
  applySocialFocus([dom.alliesListEl, dom.mobileAlliesListEl], state);
};

// "Agent token" view on /admin: mints a short-lived, read-only token via
// POST /admin/agent-token (apps/realtime-gateway/src/admin-auth/
// admin-agent-token.ts) so the admin can hand gateway diagnostics access to a
// coding agent from a phone. The token is only ever shown here, never stored.
import type { AdminApi } from "./admin-api.js";
import { el, formatWhen } from "./admin-dom.js";

export const AGENT_TOKEN_TTL_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" }
] as const;

export type MintedAgentToken = { token: string; expiresAt: number };

export const parseMintedAgentToken = (body: string): MintedAgentToken | undefined => {
  try {
    const parsed = JSON.parse(body) as { ok?: unknown; token?: unknown; expiresAt?: unknown };
    return parsed.ok === true && typeof parsed.token === "string" && typeof parsed.expiresAt === "number"
      ? { token: parsed.token, expiresAt: parsed.expiresAt }
      : undefined;
  } catch {
    return undefined;
  }
};

export const renderAgentTokenPanel = (api: AdminApi, gatewayOrigin: string): HTMLElement => {
  const gatewayHost = new URL(gatewayOrigin).host;
  const select = el("select", {}, AGENT_TOKEN_TTL_OPTIONS.map((option) => el("option", { value: String(option.hours), text: option.label })));
  select.value = "24";
  const create = el("button", { class: "primary", text: "Create token" });
  const result = el("div", { class: "agent-token-result" });

  create.addEventListener("click", () => {
    create.disabled = true;
    result.replaceChildren(el("p", { class: "meta", text: "creating…" }));
    void api.post(`/admin/agent-token?ttlHours=${select.value}`).then((response) => {
      create.disabled = false;
      const minted = response.ok ? parseMintedAgentToken(response.body) : undefined;
      if (!minted) {
        result.replaceChildren(el("p", { class: "error", text: response.ok ? "Unexpected response from the server." : response.message }));
        return;
      }
      const field = el("textarea", { class: "agent-token", readonly: "", rows: "3", spellcheck: "false" });
      field.value = minted.token;
      const copy = el("button", { text: "Copy" });
      copy.addEventListener("click", () => {
        field.select();
        void navigator.clipboard?.writeText(minted.token).then(() => { copy.textContent = "Copied"; });
      });
      result.replaceChildren(
        field,
        el("div", { class: "toolbar" }, [copy, el("span", { class: "meta", text: `expires ${formatWhen(minted.expiresAt)}` })]),
        el("p", { class: "meta", text: `Save it as a network secret for ${gatewayHost} (type: Bearer, header: Authorization) — in Claude Code, ask Claude to "add the admin agent token" and paste it into the secure form, not the chat.` })
      );
    });
  });

  return el("div", { class: "agent-token-panel" }, [
    el("p", { text: `Creates a read-only token for ${gatewayHost}'s admin endpoints (players, AI, metrics, debug bundle, world). It can't run ops actions or create more tokens.` }),
    el("p", { class: "meta", text: "To revoke every token at once, rotate ADMIN_API_TOKEN on the server." }),
    el("div", { class: "toolbar" }, [el("label", { class: "meta" }, ["valid for ", select]), create]),
    result
  ]);
};

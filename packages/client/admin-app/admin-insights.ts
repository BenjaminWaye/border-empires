// Player insights view: renders GET /admin/players/insights.json (built by
// apps/realtime-gateway/src/player-insights/player-insights.ts). Same content
// as the gateway's own token-gated page, rendered here behind Google sign-in.
// Every player-supplied string goes through textContent.
import { el, formatDuration, formatPercent, formatWhen } from "./admin-dom.js";

type SessionDistribution = { count: number; medianMs?: number | null; atLeastMinutes: Record<"10" | "30" | "60", number> };

type InsightPlayer = {
  playerId: string;
  name?: string;
  accountNew: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  spawnedAt?: number;
  firstMoveAt?: number;
  firstMoveType?: string;
  tenTilesAt?: number;
  firstContactAt?: number;
  firstContactWith?: string;
  firstContactIsAi?: boolean;
  firstInteractionAt?: number;
  firstInteractionType?: string;
  firstInteractionWith?: string;
  firstInteractionIsAi?: boolean;
  sessionCount: number;
  totalSessionMs: number;
  longestSessionMs: number;
  firstSessionMs?: number;
  recentSessions: Array<{ startedAt: number; endedAt: number }>;
};

export type PlayerInsightsResponse = {
  insights: {
    generatedAt: number;
    acquisition: { visitors: number; fromLanding: number; formShown: number; methodClicked: number; signUps: number; methods: Record<string, number> };
    cohort: {
      newAccounts: number;
      spawned: number;
      firstMove: number;
      tenTiles: number;
      firstContact: number;
      firstContactWithHuman: number;
      firstInteraction: number;
      interactionTypes: Record<string, number>;
      medianMsToSpawn?: number | null;
      medianMsToFirstMove?: number | null;
      medianMsToTenTiles?: number | null;
      medianMsToFirstContact?: number | null;
      medianMsToFirstInteraction?: number | null;
      firstSession: SessionDistribution;
    };
    allSessions: SessionDistribution;
    players: InsightPlayer[];
  };
  counters: Record<string, number>;
};

type Step = { label: string; n: number; sub?: string };

const breakdown = (counts: Record<string, number>): string => Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ");

const funnel = (title: string, note: string, steps: Step[]): HTMLElement => {
  const base = steps[0]?.n ?? 0;
  const rows = steps.map((step, index) => {
    const previous = index > 0 ? steps[index - 1]!.n : undefined;
    const sub = [step.sub, previous !== undefined ? `${formatPercent(step.n, previous)} of previous` : ""].filter(Boolean).join(" · ");
    const width = base > 0 ? Math.min(100, (step.n / base) * 100) : 0;
    return el("div", { class: "step" }, [
      el("span", { class: "label", text: step.label }),
      el("span", { class: "num", text: String(step.n) }),
      el("div", { class: "bar" }, [el("span", { style: `width:${width}%` })]),
      ...(sub ? [el("span", { class: "sub", text: sub })] : [])
    ]);
  });
  return el("section", { class: "card" }, [el("h2", { text: title }), el("p", { class: "note", text: note }), ...rows]);
};

const distribution = (title: string, d: SessionDistribution): HTMLElement[] => [
  el("div", { class: "kv head" }, [el("strong", { text: title }), el("span", { text: `${d.count} sessions` })]),
  ...(
    [
      ["median length", formatDuration(d.medianMs ?? undefined)],
      ["≥ 10 min", formatPercent(d.atLeastMinutes["10"], 1)],
      ["≥ 30 min", formatPercent(d.atLeastMinutes["30"], 1)],
      ["≥ 60 min", formatPercent(d.atLeastMinutes["60"], 1)]
    ] as const
  ).map(([key, value]) => el("div", { class: "kv" }, [el("span", { text: key }), el("span", { text: value })]))
];

const mark = (at: number | undefined, firstSeenAt: number): HTMLElement =>
  at ? el("span", { class: "yes", text: `✓ +${formatDuration(at - firstSeenAt)}` }) : el("span", { class: "no", text: "·" });

const withWhom = (id: string | undefined, isAi: boolean | undefined): string =>
  id ? ` with ${id}${isAi === true ? " (AI)" : isAi === false ? " (human)" : ""}` : "";

const playerRows = (p: InsightPlayer): HTMLElement[] => {
  const nameCell = el("td", {}, [el("span", { text: p.name ?? p.playerId }), ...(p.accountNew ? [" ", el("span", { class: "tag new", text: "new" })] : [])]);
  const row = el("tr", { class: "player" }, [
    nameCell,
    el("td", { text: formatWhen(p.firstSeenAt) }),
    el("td", { text: formatWhen(p.lastSeenAt) }),
    el("td", { class: "num", text: String(p.sessionCount) }),
    el("td", { class: "num", text: formatDuration(p.totalSessionMs) }),
    el("td", { class: "num", text: formatDuration(p.longestSessionMs) }),
    ...[p.spawnedAt, p.firstMoveAt, p.tenTilesAt, p.firstContactAt, p.firstInteractionAt].map((at) => el("td", {}, [mark(at, p.firstSeenAt)]))
  ]);
  const events = (
    [
      [p.firstSeenAt, `first seen${p.accountNew ? " (new account)" : " (existing account — tracking began here)"}`],
      [p.spawnedAt, "spawned"],
      [p.firstMoveAt, `first move${p.firstMoveType ? `: ${p.firstMoveType}` : ""}`],
      [p.tenTilesAt, "reached 10 tiles"],
      [p.firstContactAt, `first contact${withWhom(p.firstContactWith, p.firstContactIsAi)}`],
      [p.firstInteractionAt, `first interaction${p.firstInteractionType ? `: ${p.firstInteractionType}` : ""}${withWhom(p.firstInteractionWith, p.firstInteractionIsAi)}`]
    ] as Array<[number | undefined, string]>
  )
    .filter((entry): entry is [number, string] => typeof entry[0] === "number")
    .sort((a, b) => a[0] - b[0]);
  const detail = el("tr", { class: "detail", hidden: "" }, [
    el("td", { colspan: "11" }, [
      el("div", { class: "meta", text: p.playerId }),
      el("ol", { class: "timeline" }, events.map(([at, label]) => el("li", { text: `${formatWhen(at)} (+${formatDuration(at - p.firstSeenAt)}) · ${label}` }))),
      el("div", { class: "meta", text: `Recent sessions (first session ${formatDuration(p.firstSessionMs)})` }),
      el("ol", { class: "timeline" }, p.recentSessions.map((s) => el("li", { text: `${formatWhen(s.startedAt)} · ${formatDuration(s.endedAt - s.startedAt)}` })))
    ])
  ]);
  row.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
  });
  return [row, detail];
};

export const renderPlayerInsights = (data: PlayerInsightsResponse): HTMLElement => {
  const { insights, counters } = data;
  const a = insights.acquisition;
  const c = insights.cohort;
  const cards = el("div", { class: "cards" }, [
    funnel("Sign-up funnel", "Anonymous visitors to the play client, deduped per browser. Landing-page visitors who never click Play are not visible.", [
      { label: "Opened the play client", n: a.visitors, sub: `${a.fromLanding} came from borderempires.com` },
      { label: "Saw the sign-in form", n: a.formShown },
      { label: "Clicked a sign-in method", n: a.methodClicked, sub: breakdown(a.methods) },
      { label: "Created an account", n: a.signUps }
    ]),
    funnel("New players", "Accounts created in the window. Times are medians from first sign-in.", [
      { label: "New accounts", n: c.newAccounts },
      { label: "Spawned", n: c.spawned, sub: `median ${formatDuration(c.medianMsToSpawn ?? undefined)}` },
      { label: "Made a first move", n: c.firstMove, sub: `median ${formatDuration(c.medianMsToFirstMove ?? undefined)}` },
      { label: "Reached 10 tiles", n: c.tenTiles, sub: `median ${formatDuration(c.medianMsToTenTiles ?? undefined)}` },
      { label: "First contact (borders touch)", n: c.firstContact, sub: `median ${formatDuration(c.medianMsToFirstContact ?? undefined)} · ${c.firstContactWithHuman} with a human` },
      {
        label: "Interacted (attack / truce / alliance)",
        n: c.firstInteraction,
        sub: `median ${formatDuration(c.medianMsToFirstInteraction ?? undefined)}${Object.keys(c.interactionTypes).length ? ` · ${breakdown(c.interactionTypes)}` : ""}`
      }
    ]),
    el("section", { class: "card" }, [
      el("h2", { text: "Sessions" }),
      el("p", { class: "note", text: "A session is sign-in to last tab closed; reconnects within 2 minutes continue it." }),
      ...distribution("New players' first session", c.firstSession),
      ...distribution("All sessions in window", insights.allSessions)
    ])
  ]);

  const search = el("input", { type: "search", placeholder: "search name or id" });
  const newOnly = el("input", { type: "checkbox" });
  const count = el("span", { class: "meta" });
  const tbody = el("tbody");
  const renderRows = (): void => {
    const q = search.value.trim().toLowerCase();
    const rows = insights.players.filter(
      (p) => (!newOnly.checked || p.accountNew) && (!q || (p.name ?? "").toLowerCase().includes(q) || p.playerId.toLowerCase().includes(q))
    );
    count.textContent = `${rows.length} players active in window`;
    tbody.replaceChildren(...rows.flatMap(playerRows));
  };
  search.addEventListener("input", renderRows);
  newOnly.addEventListener("change", renderRows);
  renderRows();

  const headers = ["player", "first seen", "last seen", "sessions", "total", "longest", "spawn", "move", "10 tiles", "contact", "interact"];
  const players = el("section", { class: "card" }, [
    el("h2", { text: "Players" }),
    el("div", { class: "controls" }, [search, el("label", {}, [newOnly, " new accounts only"]), count]),
    el("div", { class: "table-wrap" }, [el("table", {}, [el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { text: h })))]), tbody])])
  ]);

  const counterText = Object.entries(counters).map(([key, value]) => `${key} ${value}`).join(" · ");
  return el("div", { class: "stack" }, [cards, players, el("p", { class: "meta", text: `${counterText} (since gateway start)` })]);
};

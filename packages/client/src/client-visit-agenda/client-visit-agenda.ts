// The visit agenda (docs/visit-as-a-turn.md §2.2): a few decisions worth making now, ranked, each with the
// place to act. Everything is read from state the client already holds; nothing here is a new rule. It is
// not the tracker's "Next step" (client-hud-v2-next-step.ts), which stays limited to fixes for a shortage.
// Pure; client-visit-agenda-state.ts reads ClientState into the input.

export type AgendaKind = "manpower_full" | "town_ungarrisoned" | "town_unfed" | "town_upgrade" | "manifest" | "afc_upgrade" | "manpower_near_full" | "slots_idle" | "town_upgrade_saving";

export type AgendaItem = {
  kind: AgendaKind;
  title: string;
  sub: string;
  /** A tile to show on the map; its own menu has the action. */
  focus?: { x: number; y: number };
  /** A HUD screen or panel that has the action (data-hud-v2-open). */
  open?: string;
};

export type AgendaTown = {
  name: string;
  x: number;
  y: number;
  ungarrisoned: boolean;
  unfed: boolean;
  /** Set when the town's population has passed the next tier's threshold. */
  upgrade?: { tier: string; goldCost: number };
};

export type AgendaInput = {
  manpower: {
    current: number;
    cap: number;
    nextBatchInMs: number | undefined;
    /** The server's figure for the next batch. It never exceeds the room left, so it shows a fill, not an overflow. */
    nextBatchAmount: number | undefined;
    /** A full window of regen at the current rate: what the batch would be with room for all of it. */
    fullBatch: number;
  };
  /**
   * Development slots in use, the limit, how much is queued or planned behind them, and whether the player
   * has the manpower to start anything (a garrison is the cheapest thing a slot can run).
   */
  slots: { busy: number; limit: number; queued: number; canStart: boolean };
  /** Free FOOD slots: a town tier upgrade needs one. */
  freeFoodSlots: number;
  towns: readonly AgendaTown[];
  /** Whole Coin the player can spend. */
  gold: number;
  /** Price of the next Manifest when one can be commissioned. */
  manifestCost: number | undefined;
  afcUpgradesReady: number;
};

/** The doc asks for 3 to 5: more than five stops being a short list of decisions. */
export const AGENDA_CAP = 5;

/** Most pressing first: waste and stalled towns, then things to buy, then nice-to-haves. */
const ORDER: readonly AgendaKind[] = ["manpower_full", "town_ungarrisoned", "town_unfed", "town_upgrade", "manifest", "afc_upgrade", "manpower_near_full", "slots_idle", "town_upgrade_saving"];

const count = (n: number): string => Math.round(n).toLocaleString("en-US");

const duration = (ms: number): string => {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const names = (towns: readonly AgendaTown[]): string => {
  const shown = towns.slice(0, 3).map((town) => town.name).join(", ");
  return towns.length > 3 ? `${shown} and ${towns.length - 3} more` : shown;
};

/** One row for one town (shown on the map), or one row for several (the Towns screen lists them). */
const townItem = (kind: AgendaKind, towns: readonly AgendaTown[], one: (town: AgendaTown) => { title: string; sub: string }, many: (n: number) => string): AgendaItem | undefined => {
  const first = towns[0];
  if (!first) return undefined;
  if (towns.length === 1) return { kind, ...one(first), focus: { x: first.x, y: first.y } };
  return { kind, title: many(towns.length), sub: names(towns), open: "towns" };
};

const manpowerItem = (manpower: AgendaInput["manpower"]): AgendaItem | undefined => {
  const { current, cap, nextBatchInMs, nextBatchAmount, fullBatch } = manpower;
  const when = nextBatchInMs === undefined ? "" : ` in ${duration(nextBatchInMs)}`;
  if (current >= cap) {
    return { kind: "manpower_full", title: "Manpower is full", sub: `The next batch${when} adds nothing until you spend some`, open: "manpower" };
  }
  // The server caps its figure at the room left. A batch that fills the pool while a full window of regen is
  // more than that room means some of it has nowhere to go; how much is banked is not known here, so no number.
  const room = cap - current;
  if (nextBatchAmount === undefined || nextBatchAmount < room || fullBatch - room < 1) return undefined;
  return { kind: "manpower_near_full", title: "Manpower is nearly full", sub: `The next batch${when} fills it: spend some first so none is lost`, open: "manpower" };
};

const slotsItem = (slots: AgendaInput["slots"]): AgendaItem | undefined => {
  const free = slots.limit - slots.busy;
  if (free <= 0 || slots.queued > 0 || !slots.canStart) return undefined;
  const all = slots.busy === 0;
  return {
    kind: "slots_idle",
    title: all ? "Your development slots are idle" : `${free} of ${slots.limit} development slots ${free === 1 ? "is" : "are"} free`,
    sub: "Nothing is queued: start a build or a garrison",
    open: "towns"
  };
};

export const visitAgenda = (input: AgendaInput): AgendaItem[] => {
  const { towns, gold } = input;
  const have = `you have ${count(gold)}`;
  // An unfed town is listed under that problem only: an upgrade adds FOOD demand it can't meet.
  const upgradable = towns.filter((town) => town.upgrade && !town.ungarrisoned && !town.unfed);
  // The tile menu's own gate: the Coin and one free FOOD slot (client-tile-action-town-growth.ts).
  const hasFoodSlot = input.freeFoodSlots >= 1;
  const affordable = hasFoodSlot ? upgradable.filter((town) => (town.upgrade?.goldCost ?? Infinity) <= gold) : [];
  const waiting = upgradable.filter((town) => !affordable.includes(town));
  const needs = (town: AgendaTown): string => {
    const cost = town.upgrade?.goldCost ?? 0;
    const parts = [...(cost > gold ? [`${count(cost)} Coin · ${have}`] : []), ...(hasFoodSlot ? [] : ["a free FOOD slot"])];
    return `Needs ${parts.join(" and ")}`;
  };
  const items: Array<AgendaItem | undefined> = [
    manpowerItem(input.manpower),
    townItem("town_ungarrisoned", towns.filter((town) => town.ungarrisoned),
      (town) => ({ title: `${town.name} is not garrisoned`, sub: "It earns no Coin and does not grow until you garrison it" }),
      (n) => `${n} towns are not garrisoned`),
    // An ungarrisoned town is listed once, under the worse problem.
    townItem("town_unfed", towns.filter((town) => town.unfed && !town.ungarrisoned),
      (town) => ({ title: `${town.name} is unfed`, sub: "It earns no Coin and does not grow until it gets FOOD" }),
      (n) => `${n} towns are unfed`),
    townItem("town_upgrade", affordable,
      (town) => ({ title: `${town.name} can become a ${town.upgrade?.tier ?? "City"}`, sub: `${count(town.upgrade?.goldCost ?? 0)} Coin · ${have}` }),
      (n) => `${n} towns can be upgraded`),
    input.manifestCost !== undefined && input.manifestCost <= gold
      ? { kind: "manifest", title: "A Manifest can be commissioned", sub: `${count(input.manifestCost)} Coin · ${have}`, open: "manifest" }
      : undefined,
    input.afcUpgradesReady > 0
      ? { kind: "afc_upgrade", title: input.afcUpgradesReady === 1 ? "An AFC upgrade is ready" : `${input.afcUpgradesReady} AFC upgrades are ready`, sub: "Choose at your landing base", open: "afc" }
      : undefined,
    slotsItem(input.slots),
    townItem("town_upgrade_saving", waiting,
      (town) => ({ title: `${town.name} is big enough to become a ${town.upgrade?.tier ?? "City"}`, sub: needs(town) }),
      (n) => `${n} towns are big enough to upgrade${hasFoodSlot ? " once you have the Coin" : " once a FOOD slot is free"}`)
  ];
  return items
    .filter((item): item is AgendaItem => item !== undefined)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .slice(0, AGENDA_CAP);
};

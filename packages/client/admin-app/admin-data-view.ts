// Generic renderer for the other read-only admin endpoints: an array of flat
// objects becomes a table (e.g. /admin/players), anything else is shown as
// formatted JSON, and non-JSON responses (Prometheus metrics) as plain text.
import { el } from "./admin-dom.js";

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

// The first array found at the top level or one level down (e.g.
// { ok, players: [...] }), so wrapped lists still render as tables.
const findRows = (data: unknown): Array<Record<string, unknown>> | undefined => {
  const isRows = (value: unknown): value is Array<Record<string, unknown>> =>
    Array.isArray(value) && value.length > 0 && value.every((row) => typeof row === "object" && row !== null && !Array.isArray(row));
  if (isRows(data)) return data;
  if (data && typeof data === "object") {
    for (const value of Object.values(data)) if (isRows(value)) return value;
  }
  return undefined;
};

const table = (rows: Array<Record<string, unknown>>): HTMLElement => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return el("div", { class: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [el("tr", {}, columns.map((column) => el("th", { text: column })))]),
      el("tbody", {}, rows.map((row) => el("tr", {}, columns.map((column) => el("td", { text: cellText(row[column]) })))))
    ])
  ]);
};

export const renderDataView = (body: string, contentType: string): HTMLElement => {
  if (!contentType.includes("json")) return el("pre", { class: "raw", text: body });
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return el("pre", { class: "raw", text: body });
  }
  const rows = findRows(data);
  const filter = el("input", { type: "search", placeholder: "filter rows" });
  if (!rows) return el("pre", { class: "raw", text: JSON.stringify(data, null, 2) });
  const holder = el("div", {}, [table(rows)]);
  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    holder.replaceChildren(table(q ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q)) : rows));
  });
  return el("section", { class: "card" }, [el("div", { class: "controls" }, [filter, el("span", { class: "meta", text: `${rows.length} rows` })]), holder]);
};

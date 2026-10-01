import { injectRallyPreview } from "../../packages/client/src/rally-preview/rally-preview-html.js";

export const config = { runtime: "edge" };

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BACKEND_TIMEOUT_MS = 1500;

const lookupOwnerName = async (code: string): Promise<string | undefined> => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl || !CODE_PATTERN.test(code)) return undefined;
  try {
    const response = await fetch(new URL(`/rally/preview/${code}`, backendUrl), { signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { ownerName?: unknown };
    return typeof body.ownerName === "string" ? body.ownerName : undefined;
  } catch {
    return undefined;
  }
};

// Serves the normal app shell for /r/:code with link-preview tags injected. Every failure past the shell fetch
// degrades to generic tags: a slow or down backend must never stop an invited friend from loading the game.
export async function handleRallyPreview(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const [shell, ownerName] = await Promise.all([fetch(new URL("/index.html", url.origin)), lookupOwnerName(code)]);
  if (!shell.ok) return new Response("app shell unavailable\n", { status: 502 });
  const html = injectRallyPreview(await shell.text(), { origin: url.origin, code, ownerName });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300"
    }
  });
}

export default handleRallyPreview;

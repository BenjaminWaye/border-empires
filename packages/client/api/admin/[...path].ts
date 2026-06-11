export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return new Response("BACKEND_URL not configured\n", { status: 503 });
  }

  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, backendUrl);

  const headers = new Headers(req.headers);
  headers.delete("host");

  const upstream = await fetch(target.toString(), {
    method: req.method,
    headers
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

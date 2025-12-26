import { NextResponse } from "next/server";

const baseUrl = process.env.MERCHANT_API_BASE_URL;
const adminKey = process.env.MERCHANT_ADMIN_KEY;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wantsHtml(req: Request) {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  return accept.includes("text/html") && !accept.includes("application/json");
}

function renderHtml(title: string, json: unknown) {
  const pretty = escapeHtml(JSON.stringify(json, null, 2));
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0b0f14; color: #e5e7eb; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      header { position: sticky; top: 0; background: rgba(11, 15, 20, 0.92); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding: 12px 16px; display:flex; gap: 12px; align-items:center; justify-content: space-between;}
      h1 { font-size: 14px; margin: 0; color: rgba(229, 231, 235, 0.9); }
      button { background: rgba(255, 255, 255, 0.10); color: #e5e7eb; border: 1px solid rgba(255, 255, 255, 0.10); border-radius: 8px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
      button:hover { background: rgba(255, 255, 255, 0.14); }
      main { padding: 16px; }
      pre { margin: 0; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.10); background: rgba(255, 255, 255, 0.04); overflow: auto; line-height: 1.4; font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <h1>${safeTitle}</h1>
      <button id="copy">Copy JSON</button>
    </header>
    <main>
      <pre id="json">${pretty}</pre>
    </main>
    <script>
      const jsonText = document.getElementById('json').innerText;
      document.getElementById('copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(jsonText); } catch (e) {}
      });
    </script>
  </body>
</html>`;
}

if (!baseUrl) {
  console.warn("[ops/disputes] MERCHANT_API_BASE_URL is not set");
}
if (!adminKey) {
  console.warn("[ops/disputes] MERCHANT_ADMIN_KEY is not set");
}

export async function GET(req: Request) {
  if (!baseUrl || !adminKey) {
    const payload = { error: "Merchant backend is not configured." };
    if (wantsHtml(req)) {
      return new NextResponse(renderHtml("ops/disputes (error)", payload), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json(payload, { status: 500 });
  }

  const url = new URL(req.url);
  const search = url.search || "";

  try {
    const res = await fetch(`${baseUrl}/api/merchant/disputes${search}`, {
      headers: { "X-ADMIN-KEY": adminKey },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (wantsHtml(req)) {
      return new NextResponse(renderHtml("ops/disputes", data), {
        status: res.status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/disputes] GET error", error);
    const payload = { error: "Failed to fetch disputes." };
    if (wantsHtml(req)) {
      return new NextResponse(renderHtml("ops/disputes (error)", payload), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json(payload, { status: 500 });
  }
}

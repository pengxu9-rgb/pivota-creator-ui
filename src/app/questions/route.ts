import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_ACCOUNTS_BASE = 'https://web-production-fedb.up.railway.app/accounts';

function getUpstreamAccountsBase(): string {
  const explicit =
    process.env.ACCOUNTS_UPSTREAM_BASE || process.env.NEXT_PUBLIC_ACCOUNTS_BASE || DEFAULT_ACCOUNTS_BASE;
  return String(explicit || DEFAULT_ACCOUNTS_BASE)
    .trim()
    .replace(/\/$/, '');
}

function getUpstreamOriginBase(): string {
  const accounts = getUpstreamAccountsBase();
  return accounts.endsWith('/accounts') ? accounts.slice(0, -'/accounts'.length) : accounts;
}

function splitSetCookieHeader(value: string): string[] {
  const v = String(value || '').trim();
  if (!v) return [];
  return v
    .split(/,(?=[^;]+?=)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function proxyToQuestions(req: NextRequest) {
  const upstreamUrl = `${getUpstreamOriginBase()}/questions${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host') return;
    if (lower === 'connection') return;
    if (lower === 'content-length') return;
    if (lower === 'accept-encoding') return;
    headers[key] = value;
  });
  headers['accept-encoding'] = 'identity';

  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());

  const upstreamRes = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie') return;
    if (lower === 'content-encoding') return;
    if (lower === 'content-length') return;
    if (lower === 'transfer-encoding') return;
    if (lower === 'connection') return;
    resHeaders.set(key, value);
  });

  const data = await upstreamRes.arrayBuffer();
  const res = new NextResponse(data, { status: upstreamRes.status, headers: resHeaders });

  const headersWithGetSetCookie = upstreamRes.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies: string[] =
    typeof headersWithGetSetCookie.getSetCookie === 'function'
      ? headersWithGetSetCookie.getSetCookie()
      : splitSetCookieHeader(upstreamRes.headers.get('set-cookie') || '');

  setCookies.forEach((cookie) => {
    res.headers.append('set-cookie', cookie);
  });

  return res;
}

export async function GET(req: NextRequest) {
  return proxyToQuestions(req);
}

export async function POST(req: NextRequest) {
  return proxyToQuestions(req);
}


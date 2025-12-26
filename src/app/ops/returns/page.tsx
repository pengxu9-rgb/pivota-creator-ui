'use client';

import { useEffect, useMemo, useState } from 'react';

type ReturnRecord = {
  merchant_id: string;
  source: 'shopify';
  source_return_id: string;
  order_id?: string | null;
  platform_order_id?: string | null;
  status_raw?: string | null;
  status: string;
  refund_status_raw?: string | null;
  items_json?: any;
  updated_at?: string | null;
};

type ListResponse = { items: ReturnRecord[]; total: number };

const STATUSES = ['', 'open', 'closed', 'cancelled'] as const;

export default function OpsReturnsPage() {
  const [merchantId, setMerchantId] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [data, setData] = useState<ListResponse>({ items: [], total: 0 });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (merchantId.trim()) params.set('merchantId', merchantId.trim());
    if (status) params.set('status', status);
    params.set('limit', '100');
    return `?${params.toString()}`;
  }, [merchantId, status]);

  const fetchReturns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/returns${queryString}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Failed with status ${res.status}`);
      }
      setData({
        items: Array.isArray(body.items) ? body.items : [],
        total: typeof body.total === 'number' ? body.total : 0,
      });
    } catch (err) {
      console.error('[ops/returns] load error', err);
      setError(err instanceof Error ? err.message : 'Failed to load returns.');
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const clearAll = () => {
    setMerchantId('');
    setStatus('');
    setSyncResult(null);
  };

  const syncReturns = async () => {
    const m = merchantId.trim();
    if (!m) {
      setError('Merchant ID is required to sync returns.');
      return;
    }
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch('/api/ops/returns/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: m, limit: 20 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Failed with status ${res.status}`);
      }
      setSyncResult(body);
      await fetchReturns();
    } catch (err) {
      console.error('[ops/returns] sync error', err);
      setError(err instanceof Error ? err.message : 'Failed to sync returns.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 text-white">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Returns (Shopify)</h1>
        <p className="text-sm text-white/70">
          Best-effort signals from Shopify Returns. If webhooks are unavailable, use “Sync” to pull latest returns via
          Admin GraphQL.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Merchant ID</label>
          <input
            className="w-[320px] rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            placeholder="merch_xxx"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Status</label>
          <select
            className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'Any'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15" onClick={fetchReturns}>
            Refresh
          </button>
          <button className="rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearAll}>
            Clear
          </button>
          <button
            className="rounded-md bg-emerald-500/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
            onClick={syncReturns}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync latest'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="mb-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/80">
          <div className="font-semibold mb-1">Sync result</div>
          <pre className="overflow-x-auto">{JSON.stringify(syncResult, null, 2)}</pre>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="mb-2 text-sm text-white/70">
        {loading ? 'Loading…' : `Total: ${data.total} (showing ${data.items.length})`}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-white/5 text-white/80">
            <tr>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Return ID</th>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Refund Status</th>
              <th className="px-3 py-2 text-left">Items</th>
              <th className="px-3 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {!loading && data.items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-white/60" colSpan={6}>
                  No returns found.
                </td>
              </tr>
            ) : (
              data.items.map((r) => {
                const itemCount = Array.isArray(r.items_json) ? r.items_json.length : undefined;
                return (
                  <tr key={`shopify:${r.source_return_id}`} className="hover:bg-white/5">
                    <td className="px-3 py-2 font-medium">{r.status}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.source_return_id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.order_id || r.platform_order_id || '—'}</td>
                    <td className="px-3 py-2">{r.refund_status_raw || '—'}</td>
                    <td className="px-3 py-2">{itemCount != null ? `${itemCount}` : '—'}</td>
                    <td className="px-3 py-2">{r.updated_at || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


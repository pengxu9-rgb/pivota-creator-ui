'use client';

import { useEffect, useMemo, useState } from 'react';

type DisputeRecord = {
  merchant_id: string;
  source: 'stripe' | 'shopify';
  source_dispute_id: string;
  order_id?: string | null;
  platform_order_id?: string | null;
  payment_intent_id?: string | null;
  charge_id?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  reason?: string | null;
  status_raw?: string | null;
  status: string;
  evidence_due_by?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
};

type ListResponse = { items: DisputeRecord[]; total: number };

const STATUSES = ['', 'open', 'needs_response', 'under_review', 'won', 'lost', 'closed'] as const;
const SOURCES = ['', 'stripe', 'shopify'] as const;

export default function OpsDisputesPage() {
  const [merchantId, setMerchantId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('');
  const [source, setSource] = useState<(typeof SOURCES)[number]>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse>({ items: [], total: 0 });
  const [syncing, setSyncing] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (merchantId.trim()) params.set('merchantId', merchantId.trim());
    if (orderId.trim()) params.set('orderId', orderId.trim());
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    params.set('limit', '100');
    return `?${params.toString()}`;
  }, [merchantId, orderId, source, status]);

  const fetchDisputes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/disputes${queryString}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Failed with status ${res.status}`);
      }
      setData({
        items: Array.isArray(body.items) ? body.items : [],
        total: typeof body.total === 'number' ? body.total : 0,
      });
    } catch (err) {
      console.error('[ops/disputes] load error', err);
      setError(err instanceof Error ? err.message : 'Failed to load disputes.');
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const clearAll = () => {
    setMerchantId('');
    setOrderId('');
    setStatus('');
    setSource('');
  };

  const syncFromStripe = async () => {
    const id = orderId.trim();
    if (!id) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/ops/disputes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, limit: 20 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Sync failed with status ${res.status}`);
      }
      await fetchDisputes();
    } catch (err) {
      console.error('[ops/disputes] sync error', err);
      setError(err instanceof Error ? err.message : 'Failed to sync disputes.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 text-white">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Disputes / Chargebacks</h1>
        <p className="text-sm text-white/70">
          Signals from Stripe disputes + Shopify Payments disputes. Operational view only.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Merchant ID</label>
          <input
            className="w-[320px] rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            placeholder="merch_xxx (optional)"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Order ID</label>
          <input
            className="w-[320px] rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono outline-none"
            placeholder="ORD_xxx (optional)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Source</label>
          <select
            className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            value={source}
            onChange={(e) => setSource(e.target.value as any)}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s || 'Any'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            onClick={fetchDisputes}
          >
            Refresh
          </button>
          <button
            className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
            onClick={syncFromStripe}
            disabled={!orderId.trim() || syncing}
            title="Backfill disputes for this order from Stripe (best-effort)"
          >
            {syncing ? 'Syncing…' : 'Sync from Stripe'}
          </button>
          <button
            className="rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="mb-2 text-sm text-white/70">
        {loading ? 'Loading…' : `Total: ${data.total} (showing ${data.items.length})`}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-white/5 text-white/80">
            <tr>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Dispute ID</th>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Evidence Due</th>
              <th className="px-3 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {!loading && data.items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-white/60" colSpan={8}>
                  No disputes found.
                </td>
              </tr>
            ) : (
              data.items.map((d) => (
                <tr key={`${d.source}:${d.source_dispute_id}`} className="hover:bg-white/5">
                  <td className="px-3 py-2 font-medium">{d.status}</td>
                  <td className="px-3 py-2">{d.source}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.source_dispute_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.order_id || d.platform_order_id || '—'}</td>
                  <td className="px-3 py-2">
                    {d.amount != null ? `${d.amount} ${d.currency || ''}`.trim() : '—'}
                  </td>
                  <td className="px-3 py-2">{d.reason || '—'}</td>
                  <td className="px-3 py-2">{d.evidence_due_by || '—'}</td>
                  <td className="px-3 py-2">{d.updated_at || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

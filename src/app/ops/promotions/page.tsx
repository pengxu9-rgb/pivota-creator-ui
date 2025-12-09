'use client';

import { useEffect, useState } from "react";

type PromotionType = "MULTI_BUY_DISCOUNT" | "FLASH_SALE";

type Promotion = {
  id?: string;
  name: string;
  type: PromotionType;
  description?: string;
  startAt?: string;
  endAt?: string;
  channels?: string[];
  scope?: {
    global?: boolean;
    productIds?: string[];
    categoryIds?: string[];
    brandIds?: string[];
  };
  config?: Record<string, any>;
  exposeToCreators?: boolean;
  allowedCreatorIds?: string[];
};

type Status = "ACTIVE" | "UPCOMING" | "ENDED" | "UNKNOWN";

function deriveStatus(promo: Promotion): Status {
  const now = Date.now();
  const start = promo.startAt ? new Date(promo.startAt).getTime() : null;
  const end = promo.endAt ? new Date(promo.endAt).getTime() : null;
  if (end && end < now) return "ENDED";
  if (start && start > now) return "UPCOMING";
  if (start || end) return "ACTIVE";
  return "UNKNOWN";
}

function isoToLocalInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function localInputToISO(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function toCommaString(arr?: string[]): string {
  if (!arr || arr.length === 0) return "";
  return arr.join(", ");
}

function splitComma(value: string): string[] | undefined {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

const emptyPromotion: Promotion = {
  name: "",
  type: "MULTI_BUY_DISCOUNT",
  description: "",
  startAt: "",
  endAt: "",
  channels: ["creator_agents"],
  scope: { global: true },
  config: {},
  exposeToCreators: true,
  allowedCreatorIds: [],
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);

  const fetchPromotions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/promotions", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed with status ${res.status}`);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.promotions || data.items || [];
      setPromotions(list);
    } catch (err) {
      console.error("[ops/promotions] load error", err);
      setError("Failed to load promotions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const openCreate = () => {
    setEditing({ ...emptyPromotion });
    setModalOpen(true);
    setSavingError(null);
  };

  const openEdit = (promo: Promotion) => {
    setEditing({
      ...promo,
      startAt: isoToLocalInput(promo.startAt),
      endAt: isoToLocalInput(promo.endAt),
      channels: promo.channels || [],
      scope: {
        global: promo.scope?.global,
        productIds: promo.scope?.productIds,
        categoryIds: promo.scope?.categoryIds,
        brandIds: promo.scope?.brandIds,
      },
      allowedCreatorIds: promo.allowedCreatorIds || [],
    });
    setSavingError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setSavingError(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setSavingError(null);

    const payload: any = {
      name: editing.name,
      type: editing.type,
      description: editing.description || undefined,
      startAt: localInputToISO(editing.startAt as string),
      endAt: localInputToISO(editing.endAt as string),
      channels: editing.channels && editing.channels.length ? editing.channels : undefined,
      scope: {
        global: editing.scope?.global ?? false,
        productIds: editing.scope?.productIds,
        categoryIds: editing.scope?.categoryIds,
        brandIds: editing.scope?.brandIds,
      },
      config: editing.config || {},
      exposeToCreators: editing.exposeToCreators ?? false,
      allowedCreatorIds: editing.allowedCreatorIds,
    };

    // Cleanup empty arrays/fields
    if (payload.scope && !payload.scope.global) {
      ["productIds", "categoryIds", "brandIds"].forEach((key) => {
        if (Array.isArray(payload.scope[key]) && payload.scope[key].length === 0) {
          delete payload.scope[key];
        }
      });
    }
    if (payload.allowedCreatorIds && payload.allowedCreatorIds.length === 0) {
      delete payload.allowedCreatorIds;
    }

    const method = editing.id ? "PATCH" : "POST";
    const url = editing.id ? `/api/ops/promotions/${editing.id}` : "/api/ops/promotions";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed with status ${res.status}`);
      }
      await fetchPromotions();
      closeModal();
    } catch (err) {
      console.error("[ops/promotions] save error", err);
      setSavingError(err instanceof Error ? err.message : "Failed to save promotion.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm("Delete this promotion?")) return;
    try {
      const res = await fetch(`/api/ops/promotions/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed with status ${res.status}`);
      }
      await fetchPromotions();
    } catch (err) {
      console.error("[ops/promotions] delete error", err);
      alert("Failed to delete promotion.");
    }
  };

  const renderStatusBadge = (promo: Promotion) => {
    const status = deriveStatus(promo);
    const styles: Record<Status, string> = {
      ACTIVE: "bg-emerald-500/20 text-emerald-200",
      UPCOMING: "bg-amber-500/20 text-amber-200",
      ENDED: "bg-rose-500/20 text-rose-200",
      UNKNOWN: "bg-slate-500/20 text-slate-200",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Promotions</h1>
            <p className="mt-1 text-xs text-slate-400">
              Internal console for managing merchant deals used by creator agents.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20"
          >
            New promotion
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur">
          {loading ? (
            <p className="text-sm text-slate-300">Loading promotions…</p>
          ) : error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : promotions.length === 0 ? (
            <p className="text-sm text-slate-300">No promotions yet.</p>
          ) : (
            <div className="space-y-3">
              {promotions.map((promo) => {
                const channels = promo.channels?.join(", ") || "-";
                const creatorExposure = promo.exposeToCreators
                  ? promo.allowedCreatorIds && promo.allowedCreatorIds.length > 0
                    ? promo.allowedCreatorIds.join(", ")
                    : "All creators"
                  : "Not exposed";
                return (
                  <div
                    key={promo.id || promo.name}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200 shadow-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-50">{promo.name}</p>
                          {renderStatusBadge(promo)}
                        </div>
                        <p className="text-[11px] text-slate-400">{promo.description || "No description"}</p>
                        <p className="text-[11px] text-slate-300">
                          Type: <span className="font-medium text-slate-50">{promo.type}</span>
                        </p>
                        <p className="text-[11px] text-slate-300">Channels: {channels}</p>
                        <p className="text-[11px] text-slate-300">
                          Window: {promo.startAt || "-"} → {promo.endAt || "-"}
                        </p>
                        <p className="text-[11px] text-slate-300">Creator exposure: {creatorExposure}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(promo)}
                          className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-slate-100 hover:bg-white/20"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(promo.id)}
                          className="rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalOpen && editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950/95 p-4 text-slate-50 shadow-2xl backdrop-blur sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{editing.id ? "Edit promotion" : "New promotion"}</h2>
                <p className="text-xs text-slate-400">Fill in the promotion details and save.</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-100 hover:bg-white/20"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">Name</span>
                <input
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">Type</span>
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                  value={editing.type}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value as PromotionType })}
                >
                  <option value="MULTI_BUY_DISCOUNT">MULTI_BUY_DISCOUNT</option>
                  <option value="FLASH_SALE">FLASH_SALE</option>
                </select>
              </label>

              <label className="col-span-1 flex flex-col gap-1 sm:col-span-2">
                <span className="text-[11px] text-slate-300">Description</span>
                <textarea
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                  rows={2}
                  value={editing.description || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">Start at</span>
                <input
                  type="datetime-local"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                  value={(editing.startAt as string) || ""}
                  onChange={(e) => setEditing({ ...editing, startAt: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">End at</span>
                <input
                  type="datetime-local"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                  value={(editing.endAt as string) || ""}
                  onChange={(e) => setEditing({ ...editing, endAt: e.target.value })}
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">Channels</span>
                <div className="flex flex-wrap gap-2">
                  {["web", "app", "creator_agents"].map((ch) => (
                    <label key={ch} className="flex items-center gap-2 text-[11px] text-slate-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-400/50 bg-slate-900"
                        checked={editing.channels?.includes(ch) || false}
                        onChange={(e) => {
                          const next = new Set(editing.channels || []);
                          if (e.target.checked) {
                            next.add(ch);
                          } else {
                            next.delete(ch);
                          }
                          setEditing({ ...editing, channels: Array.from(next) });
                        }}
                      />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">Scope (comma separated)</span>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-slate-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-400/50 bg-slate-900"
                      checked={editing.scope?.global || false}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          scope: { ...editing.scope, global: e.target.checked },
                        })
                      }
                    />
                    Global
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                    placeholder="Product IDs"
                    value={toCommaString(editing.scope?.productIds)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scope: {
                          ...editing.scope,
                          productIds: splitComma(e.target.value),
                        },
                      })
                    }
                  />
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                    placeholder="Category IDs"
                    value={toCommaString(editing.scope?.categoryIds)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scope: {
                          ...editing.scope,
                          categoryIds: splitComma(e.target.value),
                        },
                      })
                    }
                  />
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                    placeholder="Brand IDs"
                    value={toCommaString(editing.scope?.brandIds)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scope: {
                          ...editing.scope,
                          brandIds: splitComma(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>

              {editing.type === "MULTI_BUY_DISCOUNT" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-300">Multi-buy config</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                      placeholder="Threshold qty"
                      value={editing.config?.thresholdQuantity ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          config: {
                            ...editing.config,
                            thresholdQuantity: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                      placeholder="Discount %"
                      value={editing.config?.discountPercent ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          config: {
                            ...editing.config,
                            discountPercent: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {editing.type === "FLASH_SALE" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-300">Flash sale config</span>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      min={0}
                      className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                      placeholder="Flash price"
                      value={editing.config?.flashPrice ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          config: {
                            ...editing.config,
                            flashPrice: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                      placeholder="Original price"
                      value={editing.config?.originalPrice ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          config: {
                            ...editing.config,
                            originalPrice: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                      placeholder="Stock limit"
                      value={editing.config?.stockLimit ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          config: {
                            ...editing.config,
                            stockLimit: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-300">Creator exposure</span>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-slate-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-400/50 bg-slate-900"
                      checked={editing.exposeToCreators || false}
                      onChange={(e) => setEditing({ ...editing, exposeToCreators: e.target.checked })}
                    />
                    Expose to creators
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-50 focus:border-cyan-300/80 focus:outline-none"
                    placeholder="Allowed creator IDs (comma separated)"
                    value={toCommaString(editing.allowedCreatorIds)}
                    onChange={(e) => setEditing({ ...editing, allowedCreatorIds: splitComma(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            {savingError && <p className="mt-3 text-[11px] text-rose-300">{savingError}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save promotion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

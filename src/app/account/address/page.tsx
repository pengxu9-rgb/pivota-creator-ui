'use client';

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ShippingAddress } from "@/lib/accountsClient";
import { getLatestPaidOrderShippingAddress } from "@/lib/accountsClient";
import {
  loadSavedShippingAddress,
  saveShippingAddress,
  hasNonEmptyAddress,
} from "@/lib/addressStorage";
import { getCreatorBySlug } from "@/config/creatorAgents";

function AddressPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const creatorSlugParam =
    searchParams?.get("creator") || searchParams?.get("creator_slug") || null;
  const creatorConfig = creatorSlugParam
    ? getCreatorBySlug(creatorSlugParam)
    : undefined;

  const [form, setForm] = useState<ShippingAddress>({
    name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    country: "",
    postal_code: "",
    phone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let addr = loadSavedShippingAddress();
      if (!hasNonEmptyAddress(addr)) {
        try {
          addr = await getLatestPaidOrderShippingAddress();
        } catch (err) {
          console.error("Failed to load address from latest order", err);
        }
      }
      if (cancelled) return;
      if (addr) {
        setForm({
          name: addr.name ?? "",
          address_line1: addr.address_line1 ?? "",
          address_line2: addr.address_line2 ?? "",
          city: addr.city ?? "",
          country: addr.country ?? "",
          postal_code: addr.postal_code ?? "",
          phone: addr.phone ?? "",
        });
      }
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange =
    (field: keyof ShippingAddress) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      setSaved(false);
    };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveShippingAddress(form);
    setSaved(true);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[#f4e2d4] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#3f3125]">
              Shipping address
            </h1>
            <p className="mt-1 text-xs text-[#a38b78]">
              Save a default address to speed up checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              creatorConfig
                ? router.push(`/creator/${encodeURIComponent(creatorConfig.slug)}`)
                : router.push("/creator/nina-studio")
            }
            className="rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
          >
            Back to shopping
          </button>
        </header>

        <section className="flex flex-1 flex-col pb-8">
          <form
            onSubmit={handleSave}
            className="max-w-lg rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 text-sm shadow-sm sm:px-6 sm:py-5"
          >
            {loading ? (
              <div className="space-y-3">
                <div className="h-3 w-40 rounded-full bg-[#f5e3d4]" />
                <div className="h-3 w-full rounded-full bg-[#f5e3d4]" />
                <div className="h-3 w-3/4 rounded-full bg-[#f5e3d4]" />
              </div>
            ) : (
              <>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                      Full name
                    </label>
                    <input
                      type="text"
                      value={form.name ?? ""}
                      onChange={handleChange("name")}
                      className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                      Address line 1
                    </label>
                    <input
                      type="text"
                      value={form.address_line1 ?? ""}
                      onChange={handleChange("address_line1")}
                      className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                      Address line 2 (optional)
                    </label>
                    <input
                      type="text"
                      value={form.address_line2 ?? ""}
                      onChange={handleChange("address_line2")}
                      className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                        City
                      </label>
                      <input
                        type="text"
                        value={form.city ?? ""}
                        onChange={handleChange("city")}
                        className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                        Country / region
                      </label>
                      <input
                        type="text"
                        value={form.country ?? ""}
                        onChange={handleChange("country")}
                        className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                        Postal code
                      </label>
                      <input
                        type="text"
                        value={form.postal_code ?? ""}
                        onChange={handleChange("postal_code")}
                        className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-[#8c715c]">
                        Phone (optional)
                      </label>
                      <input
                        type="tel"
                        value={form.phone ?? ""}
                        onChange={handleChange("phone")}
                        className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-xs text-[#3f3125] outline-none focus:border-[#3f3125]"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="submit"
                    className="rounded-full bg-[#f6b59b] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#f29b7f]"
                  >
                    Save address
                  </button>
                  {saved && (
                    <span className="text-[11px] text-[#a38b78]">
                      Saved. We’ll prefill this address at checkout.
                    </span>
                  )}
                </div>
              </>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}

export default function AddressPage() {
  return (
    <Suspense>
      <AddressPageInner />
    </Suspense>
  );
}

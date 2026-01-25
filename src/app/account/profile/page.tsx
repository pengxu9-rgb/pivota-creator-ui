'use client';

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { accountsMe, type AccountsUser } from "@/lib/accountsClient";
import { getCreatorBySlug } from "@/config/creatorAgents";

function ProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const creatorSlugParam =
    searchParams?.get("creator") || searchParams?.get("creator_slug") || null;
  const creatorConfig = useMemo(
    () => (creatorSlugParam ? getCreatorBySlug(creatorSlugParam) : undefined),
    [creatorSlugParam],
  );

  const [me, setMe] = useState<AccountsUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const user = await accountsMe();
        if (!cancelled) {
          setMe(user || null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRequireLogin = () => {
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/account/profile";
    router.push(`/account/login?return_to=${encodeURIComponent(returnTo)}`);
  };

  const handleOpenOrders = () => {
    if (!me) {
      handleRequireLogin();
      return;
    }
    if (creatorConfig) {
      router.push(
        `/account/orders?creator=${encodeURIComponent(creatorConfig.slug)}`,
      );
    } else {
      router.push("/account/orders");
    }
  };

  const handleOpenPassword = () => {
    if (!me) {
      handleRequireLogin();
      return;
    }
    if (creatorConfig) {
      router.push(
        `/account/password?creator=${encodeURIComponent(creatorConfig.slug)}`,
      );
    } else {
      router.push("/account/password");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[#f4e2d4] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#3f3125]">Profile</h1>
            <p className="mt-1 text-xs text-[#a38b78]">
              Manage your chats, orders and account details.
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

        <section className="mb-4 rounded-3xl border border-[#f4e2d4] bg-white/80 px-4 py-3 text-sm shadow-sm">
          {loading ? (
            <div className="h-4 w-40 animate-pulse rounded-full bg-[#f5e3d4]" />
          ) : me ? (
            <>
              <div className="text-xs font-semibold text-[#3f3125]">
                {me.email}
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                Signed in. Your orders and chats are linked to this account.
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-[#3f3125]">
                Not signed in
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                Sign in with email to sync chats and orders across devices.
              </div>
              <button
                type="button"
                onClick={handleRequireLogin}
                className="mt-2 inline-flex items-center rounded-full bg-[#3f3125] px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-black"
              >
                Sign in with email
              </button>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2 text-sm">
          {/* 最近互动 / 历史聊天 */}
          <button
            type="button"
            className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-3 text-left shadow-sm"
            onClick={() =>
              creatorConfig
                ? router.push(
                    `/account/chats?creator=${encodeURIComponent(
                      creatorConfig.slug,
                    )}`,
                  )
                : router.push("/account/chats?creator=nina-studio")
            }
          >
            <div>
              <div className="text-xs font-semibold text-[#3f3125]">
                Recent chats
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                View and continue your past conversations.
              </div>
            </div>
            <span className="text-[11px] text-[#c19a7d]">›</span>
          </button>

          {/* 订单 */}
          <button
            type="button"
            className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-3 text-left shadow-sm"
            onClick={handleOpenOrders}
          >
            <div>
              <div className="text-xs font-semibold text-[#3f3125]">
                Orders & shipping
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                Track order status, delivery and refunds.
              </div>
            </div>
            <span className="text-[11px] text-[#c19a7d]">›</span>
          </button>

          {/* 密码 */}
          <button
            type="button"
            className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-3 text-left shadow-sm"
            onClick={handleOpenPassword}
          >
            <div>
              <div className="text-xs font-semibold text-[#3f3125]">
                Password & security
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                Set or change your password.
              </div>
            </div>
            <span className="text-[11px] text-[#c19a7d]">›</span>
          </button>

          {/* 地址 */}
          <button
            type="button"
            className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-3 text-left shadow-sm"
            onClick={() => {
              // 占位路由，后续接真实地址管理页。
              router.push("/account/address");
            }}
          >
            <div>
              <div className="text-xs font-semibold text-[#3f3125]">
                Shipping address
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                Manage your saved delivery addresses.
              </div>
            </div>
            <span className="text-[11px] text-[#c19a7d]">›</span>
          </button>

          {/* 优惠券 */}
          <button
            type="button"
            className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-3 text-left shadow-sm"
            onClick={() => {
              // 占位路由，后续接真实优惠券列表。
              router.push("/account/coupons");
            }}
          >
            <div>
              <div className="text-xs font-semibold text-[#3f3125]">
                Coupons & benefits
              </div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                View available coupons and benefits.
              </div>
            </div>
            <span className="text-[11px] text-[#c19a7d]">›</span>
          </button>
        </section>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfilePageInner />
    </Suspense>
  );
}

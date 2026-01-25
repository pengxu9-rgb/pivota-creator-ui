'use client';

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  accountsMe,
  accountsSetPassword,
  type AccountsUser,
} from "@/lib/accountsClient";
import { getCreatorBySlug } from "@/config/creatorAgents";

function PasswordPageInner() {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const user = await accountsMe();
        if (cancelled) return;
        if (!user) {
          const returnTo =
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/account/password";
          router.replace(
            `/account/login?return_to=${encodeURIComponent(returnTo)}`,
          );
          return;
        }
        setMe(user);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const hasPassword = Boolean(me?.has_password);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setError("Please enter your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await accountsSetPassword(newPassword, currentPassword || undefined);
      const target = creatorConfig
        ? `/account/profile?creator=${encodeURIComponent(creatorConfig.slug)}`
        : "/account/profile";
      router.push(target);
    } catch (err: any) {
      const code = err?.code;
      if (code === "CURRENT_PASSWORD_REQUIRED") {
        setError(
          "Please enter your current password, or sign in with an email code to reset it.",
        );
      } else if (code === "INVALID_CREDENTIALS") {
        setError("Current password is incorrect.");
      } else {
        console.error(err);
        setError(err?.message || "We couldn’t save your password. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const backTarget = creatorConfig
    ? `/account/profile?creator=${encodeURIComponent(creatorConfig.slug)}`
    : "/account/profile";

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[#3f3125]">Password</h1>
            <p className="mt-1 text-xs text-[#a38b78]">
              {hasPassword
                ? "Change your password."
                : "Set a password to skip email codes next time."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(backTarget)}
            className="rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
          >
            Back
          </button>
        </header>

        {loading ? (
          <div className="h-4 w-40 animate-pulse rounded-full bg-[#f5e3d4]" />
        ) : !me ? (
          <div className="text-xs text-[#a38b78]">Redirecting to sign in…</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 text-sm">
            <div className="rounded-2xl border border-[#f4e2d4] bg-white/80 px-4 py-3 text-xs shadow-sm">
              <div className="font-semibold text-[#3f3125]">{me.email}</div>
              <div className="mt-0.5 text-[11px] text-[#a38b78]">
                Password status: {hasPassword ? "set" : "not set"}
              </div>
            </div>

            {hasPassword && (
              <label className="block text-xs font-medium text-[#8c715c]">
                Current password{" "}
                <span className="font-normal text-[11px] text-[#a38b78]">
                  (optional if you just signed in via email code)
                </span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-sm text-[#3f3125] shadow-sm outline-none focus:border-[#3f3125]"
                  disabled={saving}
                />
              </label>
            )}

            <label className="block text-xs font-medium text-[#8c715c]">
              New password
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-sm text-[#3f3125] shadow-sm outline-none focus:border-[#3f3125]"
                disabled={saving}
              />
            </label>

            <label className="block text-xs font-medium text-[#8c715c]">
              Confirm new password
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-sm text-[#3f3125] shadow-sm outline-none focus:border-[#3f3125]"
                disabled={saving}
              />
            </label>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-full bg-[#3f3125] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function PasswordPage() {
  return (
    <Suspense>
      <PasswordPageInner />
    </Suspense>
  );
}


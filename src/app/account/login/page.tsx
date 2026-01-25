'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  accountsLogin,
  accountsLoginWithPassword,
  accountsSetPassword,
  accountsVerify,
} from "@/lib/accountsClient";

type LoginMethod = "otp" | "password";
type LoginStep = "email" | "otp" | "set_password";

export default function AccountLoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod>("otp");
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const redirectAfterLogin = () => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const returnTo = url.searchParams.get("return_to");
      if (returnTo) {
        router.push(returnTo);
        return;
      }
    }
    router.push("/");
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await accountsLoginWithPassword(email, password);
      redirectAfterLogin();
    } catch (err: any) {
      const code = err?.code;
      if (code === "NO_PASSWORD") {
        setError("No password is set for this account. Use email code once, then set a password.");
        setMethod("otp");
        setStep("email");
      } else if (code === "INVALID_CREDENTIALS") {
        setError("Email or password is incorrect.");
      } else {
        console.error(err);
        setError("We couldn’t sign you in. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await accountsLogin(email);
      setStep("otp");
    } catch (err) {
      console.error(err);
      setError("We couldn’t send the code. Please check your email and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setError("Please enter the verification code.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const user = await accountsVerify(email, otp);
      if (!(user as any)?.has_password) {
        setStep("set_password");
        return;
      }
      redirectAfterLogin();
    } catch (err) {
      console.error(err);
      setError("The code seems incorrect or expired. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
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
    setIsLoading(true);
    try {
      await accountsSetPassword(newPassword);
      redirectAfterLogin();
    } catch (err) {
      console.error(err);
      setError("We couldn’t save your password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Use password (recommended) or a one-time email code to access your orders across Pivota and creator agents.
          </p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setMethod("password");
              setStep("email");
              setError(null);
            }}
            className={`rounded-full border px-4 py-2 font-medium shadow-sm ${
              method === "password"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setMethod("otp");
              setStep("email");
              setError(null);
            }}
            className={`rounded-full border px-4 py-2 font-medium shadow-sm ${
              method === "otp"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Email code
          </button>
        </div>

        {method === "password" && step === "email" && (
          <form onSubmit={handlePasswordLogin} className="space-y-4 text-sm">
            <label className="block text-xs font-medium text-slate-700">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
              />
            </label>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {method === "otp" && step === "email" && (
          <form onSubmit={handleSendCode} className="space-y-4 text-sm">
            <label className="block text-xs font-medium text-slate-700">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
              />
            </label>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Sending code…" : "Send code"}
            </button>
          </form>
        )}

        {method === "otp" && step === "otp" && (
          <form onSubmit={handleVerify} className="space-y-4 text-sm">
            <p className="text-xs text-slate-600">
              We’ve sent a 6-digit code to <span className="font-medium">{email}</span>. Enter it below to
              sign in.
            </p>
            <label className="block text-xs font-medium text-slate-700">
              Verification code
              <input
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
              />
            </label>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Signing in…" : "Verify and sign in"}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setStep("email")}
              className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === "set_password" && (
          <form onSubmit={handleSetPassword} className="space-y-4 text-sm">
            <p className="text-xs text-slate-600">
              Set a password for <span className="font-medium">{email}</span> to avoid email codes next time.
            </p>
            <label className="block text-xs font-medium text-slate-700">
              New password
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Confirm password
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
              />
            </label>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Saving…" : "Save password & continue"}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={redirectAfterLogin}
              className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Skip for now
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

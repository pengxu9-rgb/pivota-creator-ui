'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountsLogin, accountsVerify } from "@/lib/accountsClient";

type LoginStep = "email" | "otp" | "success";

export default function AccountLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      await accountsVerify(email, otp);
      setStep("success");
      // After login, send user to orders list.
      router.push("/account/orders");
    } catch (err) {
      console.error(err);
      setError("The code seems incorrect or expired. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">Sign in with email</h1>
          <p className="mt-1 text-sm text-slate-600">
            Use a one-time verification code to access your orders across Pivota and creator agents.
          </p>
        </header>

        {step === "email" && (
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

        {step === "otp" && (
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
      </div>
    </main>
  );
}


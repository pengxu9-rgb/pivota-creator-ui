import Link from "next/link";
import { CREATOR_AGENTS } from "@/config/creatorAgents";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50 px-4 py-10">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      </div>

      <div className="mb-6 flex w-full max-w-3xl items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Pivota Creator Agent UI</h1>
          <p className="mt-1 text-sm text-slate-400">
            Each creator has a dedicated shopping agent experience.
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {CREATOR_AGENTS.map((creator) => (
          <Link
            key={creator.id}
            href={`/creator/${creator.slug}`}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-cyan-400/60 hover:bg-white/10"
          >
            <div className="h-9 w-9 overflow-hidden rounded-2xl bg-slate-800">
              <img src={creator.avatarUrl} alt={creator.name} className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-50">{creator.name}</div>
              {creator.tagline && (
                <div className="text-[11px] text-slate-400">{creator.tagline}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

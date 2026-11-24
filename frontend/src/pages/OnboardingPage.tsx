import { useState } from "react";
import { Logo } from "../components/Logo";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export default function OnboardingPage() {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choosePersonal() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/onboarding", {
        method: "POST",
        body: JSON.stringify({ account_type: "personal" }),
      });
      await refresh(); // Gate moves on to the workspace
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col px-6 py-8 sm:px-12 lg:px-20">
      <Logo />

      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight">How will you use HookReplay?</h1>
          <p className="mt-2 text-muted">This helps us set things up for you.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button
              onClick={choosePersonal}
              disabled={busy}
              className="rounded-xl border border-line bg-panel p-5 text-left transition-colors hover:border-signal disabled:opacity-60"
            >
              <h3 className="font-medium">Personal</h3>
              <p className="mt-1 text-sm text-muted">For your own projects and debugging.</p>
            </button>

            <button
              disabled
              className="cursor-not-allowed rounded-xl border border-line bg-panel p-5 text-left opacity-50"
            >
              <h3 className="font-medium">Professional</h3>
              <p className="mt-1 text-sm text-muted">Teams and company use.</p>
              <span className="mt-3 inline-block rounded bg-raised px-2 py-0.5 text-xs text-muted">
                Coming soon
              </span>
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
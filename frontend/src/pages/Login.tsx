import { useState, type FormEvent } from "react";
import { RotateCw } from "lucide-react";
import { Logo } from "../components/Logo";
import { MethodBadge } from "../components/MethodBadge";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

const SAMPLE = [
  { method: "POST", path: "/webhooks/stripe", age: "12s ago", hot: true },
  { method: "POST", path: "/webhooks/github", age: "1m ago", hot: false },
  { method: "PUT", path: "/shopify/orders/8841", age: "4m ago", hot: false },
  { method: "POST", path: "/webhooks/stripe", age: "9m ago", hot: false },
];

const inputClass =
  "mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm placeholder:text-muted/60 focus:border-signal focus:outline-none";

const primaryBtn =
  "w-full rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-60";

const ghostBtn =
  "w-full rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:bg-raised disabled:opacity-60";

export default function Login() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  const sendCredentials = () =>
    api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });

  function onCredentials(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await sendCredentials();
      setStep("otp");
      setInfo(`We sent a 6-digit code to ${email}`);
    });
  }

  function onVerify(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await api("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, otp }) });
      await refresh(); // Gate in App.tsx takes over from here
    });
  }

  function onResend() {
    run(async () => {
      await sendCredentials();
      setInfo("A new code has been sent");
    });
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  }

  function backToCredentials() {
    setStep("credentials");
    setOtp("");
    setError(null);
    setInfo(null);
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <main className="flex flex-col px-6 py-8 sm:px-12 lg:px-20">
        <Logo />

        <div className="flex flex-1 items-center py-12">
          {step === "credentials" ? (
            <form onSubmit={onCredentials} className="w-full max-w-sm">
              <h1 className="text-3xl font-semibold tracking-tight">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-2 text-muted">
                {mode === "login"
                  ? "Sign in to see what your endpoints have caught."
                  : "We'll email you a code to confirm it's you."}
              </p>

              <div className="mt-8 space-y-5">
                <div>
                  <label htmlFor="email" className="text-sm font-medium">Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="password" className="text-sm font-medium">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={mode === "signup" ? 8 : 1}
                    required
                  />
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

              <button type="submit" disabled={busy} className={`${primaryBtn} mt-7`}>
                {busy ? "Please wait…" : "Continue"}
              </button>
              <button type="button" onClick={switchMode} className={`${ghostBtn} mt-3`}>
                {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="w-full max-w-sm">
              <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
              {info && <p className="mt-2 text-muted">{info}</p>}

              <div className="mt-8">
                <label htmlFor="otp" className="text-sm font-medium">Verification code</label>
                <input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                />
              </div>

              {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

              <button type="submit" disabled={busy || otp.length !== 6} className={`${primaryBtn} mt-7`}>
                {busy ? "Verifying…" : "Verify and continue"}
              </button>
              <button type="button" onClick={onResend} disabled={busy} className={`${ghostBtn} mt-3`}>
                Resend code
              </button>
              <button type="button" onClick={backToCredentials} className={`${ghostBtn} mt-3`}>
                Back
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-muted">Capture URLs stay active for 24 hours.</p>
      </main>

      <aside
        aria-hidden="true"
        className="relative hidden items-center overflow-hidden border-l border-line bg-panel px-16 lg:flex"
      >
        <div className="mx-auto w-full max-w-lg">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Catch a webhook once. Replay it until your code gets it right.
          </h2>

          <div className="mt-10 overflow-hidden rounded-xl border border-line bg-bg shadow-2xl shadow-black/40">
            <ul className="divide-y divide-line">
              {SAMPLE.map((r, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 ${r.hot ? "bg-raised" : ""}`}
                >
                  <MethodBadge method={r.method} />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{r.path}</span>
                  <span className="text-xs text-muted">{r.age}</span>
                  {r.hot && (
                    <span className="anim-replay-spin grid size-7 place-items-center rounded-md bg-signal text-white">
                      <RotateCw size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="anim-result-in flex items-center gap-3 border-t border-line bg-raised px-4 py-3 text-sm">
              <span className="rounded bg-live/15 px-2 py-0.5 font-mono text-xs font-medium text-live">
                200
              </span>
              <span className="font-mono text-xs text-muted">localhost:3000/webhook</span>
              <span className="ml-auto text-xs text-muted">41 ms</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
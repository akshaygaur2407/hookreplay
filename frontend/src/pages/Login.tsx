import { useNavigate } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { Logo } from "../components/Logo";
import { MethodBadge } from "../components/MethodBadge";

const SAMPLE = [
  { method: "POST", path: "/webhooks/stripe", age: "12s ago", hot: true },
  { method: "POST", path: "/webhooks/github", age: "1m ago", hot: false },
  { method: "PUT", path: "/shopify/orders/8841", age: "4m ago", hot: false },
  { method: "POST", path: "/webhooks/stripe", age: "9m ago", hot: false },
];

const inputClass =
  "mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm placeholder:text-muted/60 focus:border-signal focus:outline-none";

export default function Login() {
  const navigate = useNavigate();

  // No auth yet: any submit goes straight in.
  function enter(e: React.FormEvent) {
    e.preventDefault();
    navigate("/app");
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <main className="flex flex-col px-6 py-8 sm:px-12 lg:px-20">
        <Logo />

        <div className="flex flex-1 items-center py-12">
          <form onSubmit={enter} className="w-full max-w-sm">
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="mt-2 text-muted">
              Sign in to see what your endpoints have caught.
            </p>

            <div className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-7 w-full rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover"
            >
              Sign in
            </button>

            <p className="mt-5 text-sm text-muted">
              Accounts aren't connected yet, so any details will get you in.
            </p>
          </form>
        </div>

        <p className="text-xs text-muted">
          Capture URLs stay active for 24 hours.
        </p>
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
                  className={`flex items-center gap-3 px-4 py-3 ${
                    r.hot ? "bg-raised" : ""
                  }`}
                >
                  <MethodBadge method={r.method} />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">
                    {r.path}
                  </span>
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
              <span className="font-mono text-xs text-muted">
                localhost:3000/webhook
              </span>
              <span className="ml-auto text-xs text-muted">41 ms</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

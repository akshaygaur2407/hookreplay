import { useEffect, useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Info, ShieldAlert, ShieldCheck, X } from "lucide-react";

import { getEventBody } from "../lib/api";
import {
  PROVIDER_LIST,
  PROVIDERS,
  detectProvider,
  verifySignature,
  type Finding,
  type ProviderId,
  type VerifyResult,
} from "../lib/signatures";
import type { HookEvent } from "../lib/types";

function FindingRow({ f }: { f: Finding }) {
  const icon =
    f.level === "ok" ? (
      <Check size={16} className="text-live" />
    ) : f.level === "error" ? (
      <X size={16} className="text-bad" />
    ) : f.level === "warn" ? (
      <AlertTriangle size={16} className="text-warn" />
    ) : (
      <Info size={16} className="text-muted" />
    );

  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{f.title}</p>
        {f.detail && <p className="mt-0.5 text-sm leading-relaxed text-muted">{f.detail}</p>}
      </div>
    </li>
  );
}

export function SignaturePanel({ slug, event }: { slug: string; event: HookEvent }) {
  const detected = detectProvider(event.headers);
  const [providerId, setProviderId] = useState<ProviderId>(detected ?? "razorpay");
  const [secret, setSecret] = useState("");
  const [reveal, setReveal] = useState(false);
  const [body, setBody] = useState<Uint8Array | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const provider = PROVIDERS[providerId];

  // raw bytes, exactly as captured
  useEffect(() => {
    let cancelled = false;
    getEventBody(slug, event.id)
      .then((b) => {
        if (!cancelled) setBody(b);
      })
      .catch((e) => {
        if (!cancelled) setBodyError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, event.id]);

  // verification runs in the browser; the secret never leaves this component
  useEffect(() => {
    if (!body) return;
    let cancelled = false;
    verifySignature({
      provider: PROVIDERS[providerId],
      headers: event.headers,
      body,
      secret,
      receivedAt: Date.parse(event.received_at),
      now: Date.now(),
    })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setResult({
            status: "invalid",
            findings: [
              { level: "error", title: "Could not run verification", detail: (e as Error).message },
            ],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [body, providerId, secret, event.headers, event.received_at]);

  const status = result?.status;

  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 className="text-sm font-semibold">Signature check</h3>
        <span className="text-xs text-muted">
          {detected
            ? `Detected ${PROVIDERS[detected].label} from the ${PROVIDERS[detected].header} header`
            : "No known signature header found"}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div>
            <label htmlFor="sig-provider" className="text-xs text-muted">
              Provider
            </label>
            <select
              id="sig-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value as ProviderId)}
              className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm"
            >
              {PROVIDER_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sig-secret" className="text-xs text-muted">
              Signing secret
            </label>
            <div className="relative mt-1">
              <input
                id="sig-secret"
                name="webhook-signing-secret"
                type={reveal ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Paste your webhook secret"
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                className="w-full rounded-lg border border-line bg-raised py-2 pl-3 pr-10 font-mono text-sm focus:border-signal focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide secret" : "Show secret"}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-fg"
              >
                {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted">
          Computed in your browser. The secret is never sent to HookReplay and isn't stored.
        </p>

        {bodyError ? (
          <p role="alert" className="text-sm text-bad">
            {bodyError}
          </p>
        ) : !result ? (
          <p className="text-sm text-muted">Loading request body…</p>
        ) : status === "needs-secret" ? (
          <div className="rounded-lg bg-raised px-4 py-3 text-sm">
            <p className="font-medium">Enter your signing secret to verify this request.</p>
            <p className="mt-1 text-muted">{provider.secretHint}</p>
          </div>
        ) : (
          <div
            className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
              status === "valid" ? "bg-live/10 text-live" : "bg-bad/10 text-bad"
            }`}
          >
            {status === "valid" ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
            <span className="text-sm font-semibold">
              {status === "valid"
                ? "Signature valid"
                : status === "no-signature"
                  ? "No signature found"
                  : "Signature invalid"}
            </span>
          </div>
        )}

        {result && result.findings.length > 0 && (
          <ul className="divide-y divide-line">
            {result.findings.map((f, i) => (
              <FindingRow key={i} f={f} />
            ))}
          </ul>
        )}

        {result?.status === "invalid" && result.expected && result.received && (
          <dl className="space-y-1 rounded-lg bg-raised p-3 font-mono text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted">Received</dt>
              <dd className="min-w-0 break-all">{result.received}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted">Expected</dt>
              <dd className="min-w-0 break-all">{result.expected}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
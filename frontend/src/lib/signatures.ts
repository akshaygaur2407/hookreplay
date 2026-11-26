export type Algo = "SHA-1" | "SHA-256" | "SHA-512";
export type Encoding = "hex" | "base64";
export type ProviderId = "razorpay" | "stripe" | "github";

export type Level = "ok" | "warn" | "error" | "info";
export type Finding = { level: Level; title: string; detail?: string };
export type Status = "valid" | "invalid" | "no-signature" | "needs-secret";

export type VerifyResult = {
  status: Status;
  findings: Finding[];
  received?: string;
  expected?: string;
};

type Extracted = { signatures: string[]; timestamp?: number } | { error: string };

export type Provider = {
  id: ProviderId;
  label: string;
  header: string;
  algo: Algo;
  encoding: Encoding;
  secretHint: string;
  toleranceSeconds?: number;
  extract: (headerValue: string) => Extracted;
  signedPayload: (body: Uint8Array, timestamp?: number) => Uint8Array;
};

export type VerifyInput = {
  provider: Provider;
  headers: [string, string][];
  body: Uint8Array;
  secret: string;
  receivedAt: number; // ms, when HookReplay captured it
  now: number; // ms
};

const encoder = new TextEncoder();

/* ---------- byte helpers ---------- */

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

async function hmac(algo: Algo, key: Uint8Array, data: Uint8Array) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is unavailable. Open HookReplay over https:// or http://localhost.");
  }
  const k = await subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: algo },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle.sign("HMAC", k, data as BufferSource));
}

function describeMatch(bytes: Uint8Array, received: string): Encoding | null {
  const r = received.trim();
  if (r.toLowerCase() === toHex(bytes)) return "hex";
  if (r === toBase64(bytes)) return "base64";
  return null;
}

function fmtDuration(s: number) {
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 129600) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} days`;
}

/* ---------- providers ---------- */

export const PROVIDERS: Record<ProviderId, Provider> = {
  razorpay: {
    id: "razorpay",
    label: "Razorpay",
    header: "X-Razorpay-Signature",
    algo: "SHA-256",
    encoding: "hex",
    secretHint:
      "Use the webhook secret you typed when creating the webhook (Dashboard → Settings → Webhooks). It is not your API key secret, and the two are easy to mix up.",
    extract: (value) => ({ signatures: [value.trim()] }),
    signedPayload: (body) => body,
  },

  stripe: {
    id: "stripe",
    label: "Stripe",
    header: "Stripe-Signature",
    algo: "SHA-256",
    encoding: "hex",
    toleranceSeconds: 300,
    secretHint:
      'Use the endpoint signing secret (starts with "whsec_"), not an API key. The secret printed by "stripe listen" is different from the Dashboard secret for the same URL.',
    extract: (value) => {
      let timestamp: number | undefined;
      const signatures: string[] = [];
      for (const part of value.split(",")) {
        const i = part.indexOf("=");
        if (i < 0) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k === "t") timestamp = Number(v);
        else if (k === "v1") signatures.push(v);
      }
      if (timestamp === undefined || Number.isNaN(timestamp)) {
        return { error: "No t= timestamp found. Expected: t=1700000000,v1=<hex>" };
      }
      if (signatures.length === 0) {
        return { error: "No v1= signature found (only older schemes such as v0 are present)." };
      }
      return { signatures, timestamp };
    },
    signedPayload: (body, ts) => concat(encoder.encode(`${ts}.`), body),
  },

  github: {
    id: "github",
    label: "GitHub",
    header: "X-Hub-Signature-256",
    algo: "SHA-256",
    encoding: "hex",
    secretHint:
      "Use exactly the Secret entered in the repository (or organization) webhook settings.",
    extract: (value) => {
      const v = value.trim();
      if (!v.startsWith("sha256=")) {
        return { error: 'Expected the format "sha256=<hex>".' };
      }
      return { signatures: [v.slice("sha256=".length)] };
    },
    signedPayload: (body) => body,
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

/* ---------- header helpers ---------- */

export function findHeader(headers: [string, string][], name: string) {
  const lower = name.toLowerCase();
  return headers.find(([k]) => k.toLowerCase() === lower)?.[1];
}

export function detectProvider(headers: [string, string][]): ProviderId | null {
  for (const p of PROVIDER_LIST) {
    if (findHeader(headers, p.header) !== undefined) return p.id;
  }
  return null;
}

/* ---------- diagnostic variants ---------- */

type Candidate = {
  bytes: Uint8Array;
  note: { title: string; detail: string } | null;
};

function secretCandidates(secret: string, provider: Provider): Candidate[] {
  const out: Candidate[] = [{ bytes: encoder.encode(secret), note: null }];
  const seen = new Set([secret]);
  const add = (value: string, title: string, detail: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push({ bytes: encoder.encode(value), note: { title, detail } });
  };

  const trimmed = secret.trim();
  add(
    trimmed,
    "The secret you entered has extra whitespace",
    "A leading or trailing space or newline came along with the secret. The signature matches once it is trimmed. Check your .env file or secrets manager for a stray newline.",
  );

  const unquoted = trimmed.replace(/^(["'])(.*)\1$/, "$2");
  add(
    unquoted,
    "The secret you entered is wrapped in quotes",
    "The quotes are part of the value, so your code is using a different key than the sender. Remove them.",
  );

  if (provider.id === "stripe") {
    if (unquoted.startsWith("whsec_")) {
      add(
        unquoted.slice("whsec_".length),
        'The sender signed without the "whsec_" prefix',
        'Stripe uses the whole "whsec_…" string as the key. A signature made from the part after the prefix usually means a hand-written test sender.',
      );
    } else {
      add(
        `whsec_${unquoted}`,
        'The secret is missing its "whsec_" prefix',
        'Stripe signing secrets start with "whsec_" and the whole string is the key.',
      );
    }
  }
  return out;
}

function bodyCandidates(body: Uint8Array): Candidate[] {
  const out: Candidate[] = [{ bytes: body, note: null }];

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return out; // binary body: no text variants
  }

  const seen = new Set([text]);
  const add = (t: string, title: string, detail: string) => {
    if (seen.has(t)) return;
    seen.add(t);
    out.push({ bytes: encoder.encode(t), note: { title, detail } });
  };

  const common =
    "The sender signed different bytes than it transmitted, or something between you and the sender rewrote the body. This is common with hand-written test scripts that sign one serialization and send another.";

  add(text.trim(), "The signature matches this body with surrounding whitespace trimmed", common);
  add(`${text}\n`, "The signature matches this body with a trailing newline added", common);
  add(text.replace(/\r\n/g, "\n"), "The signature matches this body with CRLF converted to LF", common);

  try {
    const parsed = JSON.parse(text);
    add(JSON.stringify(parsed), "The signature matches this body re-serialized as compact JSON", common);
    add(JSON.stringify(parsed, null, 2), "The signature matches this body re-serialized as pretty-printed JSON", common);
  } catch {
    // not JSON
  }
  return out;
}

/* ---------- findings ---------- */

function reserializationFinding(body: Uint8Array): Finding | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
  let compact: string;
  try {
    compact = JSON.stringify(JSON.parse(text));
  } catch {
    return null;
  }
  if (compact === text) return null;

  return {
    level: "warn",
    title: "Parsing and re-serializing this body changes its bytes",
    detail:
      `The raw body is ${body.length} bytes, but JSON.stringify(JSON.parse(body)) gives ${encoder.encode(compact).length}. ` +
      "A handler that verifies a re-serialized body instead of the raw one will fail even though this signature is valid. " +
      'Verify against the raw bytes: Express express.raw({ type: "application/json" }), FastAPI await request.body(), Django request.body, Flask request.get_data().',
  };
}

function timestampFindings(
  provider: Provider,
  ts: number | undefined,
  receivedAtMs: number,
  nowMs: number,
): Finding[] {
  if (ts === undefined || provider.toleranceSeconds === undefined) return [];
  const tol = provider.toleranceSeconds;
  const out: Finding[] = [];

  const skew = Math.round(receivedAtMs / 1000 - ts);
  const fresh = Math.abs(skew) <= tol;

  if (fresh) {
    out.push({ level: "ok", title: "Timestamp was within tolerance when it arrived" });
  } else {
    out.push({
      level: "warn",
      title: `Timestamp was ${fmtDuration(Math.abs(skew))} ${skew > 0 ? "old" : "in the future"} when it arrived`,
      detail: `${provider.label} libraries reject timestamps more than ${tol} seconds from the current time. This fails separately from the signature itself, so check the clocks on both sides.`,
    });
  }

  const age = Math.round(nowMs / 1000 - ts);
  if (fresh && age > tol) {
    out.push({
      level: "info",
      title: "Replaying this event will fail the timestamp check",
      detail: `The signed timestamp is now ${fmtDuration(age)} old. A byte-for-byte replay keeps the signature valid, but a handler enforcing the ${tol}-second tolerance will reject it. For debugging, raise or disable the tolerance in your test environment.`,
    });
  }
  return out;
}

const HEX_LENGTH: Record<Algo, number> = { "SHA-1": 40, "SHA-256": 64, "SHA-512": 128 };

function formatHint(provider: Provider, sig: string): Finding | null {
  if (provider.encoding !== "hex") return null;
  if (!/^[0-9a-f]+$/i.test(sig)) {
    return {
      level: "warn",
      title: "The received signature isn't hex",
      detail: `${provider.label} signatures are hex-encoded. This one looks like another encoding (base64?), so the sender may not be ${provider.label}.`,
    };
  }
  const want = HEX_LENGTH[provider.algo];
  if (sig.length !== want) {
    return {
      level: "warn",
      title: `The received signature is ${sig.length} hex characters, expected ${want}`,
      detail: `HMAC-${provider.algo} in hex is ${want} characters. A different length suggests a different algorithm or a truncated header.`,
    };
  }
  return null;
}

/* ---------- main entry ---------- */

export async function verifySignature(input: VerifyInput): Promise<VerifyResult> {
  const { provider, headers, body, secret, receivedAt, now } = input;

  const raw = findHeader(headers, provider.header);
  if (raw === undefined) {
    const other = detectProvider(headers);
    return {
      status: "no-signature",
      findings: [
        other && other !== provider.id
          ? {
              level: "error",
              title: `No ${provider.header} header on this request`,
              detail: `It carries a ${PROVIDERS[other].label} signature header instead. Switch the provider to ${PROVIDERS[other].label}.`,
            }
          : {
              level: "error",
              title: `No ${provider.header} header on this request`,
              detail:
                "Some senders only sign when a secret is configured. Also check that a proxy or gateway isn't stripping the header.",
            },
      ],
    };
  }

  const parsed = provider.extract(raw);
  if ("error" in parsed) {
    return {
      status: "invalid",
      received: raw,
      findings: [
        { level: "error", title: "Signature header is malformed", detail: parsed.error },
      ],
    };
  }

  const received = parsed.signatures;
  const tsFindings = timestampFindings(provider, parsed.timestamp, receivedAt, now);

  if (secret === "") {
    return { status: "needs-secret", findings: tsFindings, received: received[0] };
  }

  const matchAny = (bytes: Uint8Array): Encoding | null => {
    for (const r of received) {
      const m = describeMatch(bytes, r);
      if (m) return m;
    }
    return null;
  };
  const sign = (secretBytes: Uint8Array, bodyBytes: Uint8Array, algo: Algo = provider.algo) =>
    hmac(algo, secretBytes, provider.signedPayload(bodyBytes, parsed.timestamp));
  const render = (bytes: Uint8Array) =>
    provider.encoding === "hex" ? toHex(bytes) : toBase64(bytes);

  /* 1. the straightforward check */
  const expectedBytes = await sign(encoder.encode(secret), body);
  const expected = render(expectedBytes);

  if (matchAny(expectedBytes) === provider.encoding) {
    const findings: Finding[] = [
      {
        level: "ok",
        title: "Signature is valid",
        detail: `HMAC-${provider.algo} of the exact bytes HookReplay received matches the ${provider.header} header.`,
      },
    ];
    const reser = reserializationFinding(body);
    if (reser) findings.push(reser);
    findings.push(...tsFindings);
    return { status: "valid", findings, received: received[0], expected };
  }

  /* 2. close variants of secret and body */
  for (const s of secretCandidates(secret, provider)) {
    for (const b of bodyCandidates(body)) {
      const enc = matchAny(await sign(s.bytes, b.bytes));
      if (!enc) continue;

      const findings: Finding[] = [];
      if (s.note) findings.push({ level: "error", ...s.note });
      if (b.note) findings.push({ level: "error", ...b.note });
      if (enc !== provider.encoding) {
        findings.push({
          level: "error",
          title: `The signature is ${enc}-encoded, but ${provider.label} documents ${provider.encoding}`,
          detail: "The HMAC itself is correct; only the encoding of the header differs from the docs.",
        });
      }
      findings.push(...tsFindings);
      return { status: "invalid", findings, received: received[0], expected };
    }
  }

  /* 3. another algorithm */
  for (const algo of ["SHA-1", "SHA-256", "SHA-512"] as const) {
    if (algo === provider.algo) continue;
    if (matchAny(await sign(encoder.encode(secret), body, algo))) {
      return {
        status: "invalid",
        received: received[0],
        expected,
        findings: [
          {
            level: "error",
            title: `The signature was computed with HMAC-${algo}, not HMAC-${provider.algo}`,
            detail: "Your secret and body are right. The sender is using a different hash algorithm than the one documented.",
          },
          ...tsFindings,
        ],
      };
    }
  }

  /* 4. nothing matched */
  const findings: Finding[] = [
    {
      level: "error",
      title: "Signature does not match",
      detail: `HookReplay recomputed HMAC-${provider.algo} over the exact bytes it received and got a different value. The cause is almost always the secret.`,
    },
    { level: "info", title: "Check the secret", detail: provider.secretHint },
  ];
  const hint = formatHint(provider, received[0]);
  if (hint) findings.push(hint);
  findings.push({
    level: "info",
    title: "Or the body was signed differently than it was sent",
    detail:
      "HookReplay stores the body byte-for-byte. If a proxy, gateway or a test script signed different bytes than it transmitted, no secret will match.",
  });
  findings.push(...tsFindings);

  return { status: "invalid", findings, received: received[0], expected };
}
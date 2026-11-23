const COLORS: Record<string, string> = {
  GET: "bg-sky-400/10 text-sky-300",
  POST: "bg-emerald-400/10 text-emerald-300",
  PUT: "bg-amber-400/10 text-amber-300",
  PATCH: "bg-violet-400/10 text-violet-300",
  DELETE: "bg-rose-400/10 text-rose-300",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-block min-w-14 rounded px-1.5 py-0.5 text-center font-mono text-xs font-medium ${
        COLORS[method] ?? "bg-white/5 text-muted"
      }`}
    >
      {method}
    </span>
  );
}

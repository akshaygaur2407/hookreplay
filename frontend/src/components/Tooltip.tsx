import { useId, type ReactNode } from "react";

interface Props {
  content: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
}

export function Tooltip({ content, children, align = "end" }: Props) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="inline-flex cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-raised px-3 py-2 text-left text-xs font-normal leading-relaxed text-fg opacity-0 shadow-xl shadow-black/40 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${
          align === "end" ? "right-0" : "left-0"
        }`}
      >
        {content}
      </span>
    </span>
  );
}
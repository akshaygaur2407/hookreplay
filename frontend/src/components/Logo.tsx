import { RotateCw } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-signal text-white">
        <RotateCw size={17} strokeWidth={2.5} />
      </span>
      <span className="text-lg font-semibold tracking-tight">HookReplay</span>
    </div>
  );
}

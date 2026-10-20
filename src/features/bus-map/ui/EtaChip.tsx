import type { EtaDisplay } from "@/lib/eta";

type Props = {
  eta: EtaDisplay;
  isLastBus: boolean;
};

export function EtaChip({ eta, isLastBus }: Props) {
  if (eta.tone === "arriving") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-arriving px-2.5 py-1 text-xs font-semibold text-white">
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-[live-ping_1.4s_ease-out_infinite] rounded-full bg-white" />
          <span className="relative size-1.5 rounded-full bg-white" />
        </span>
        {eta.label}
      </span>
    );
  }

  if (eta.tone === "soon") {
    return <span className="rounded-full bg-soon-soft px-2.5 py-1 text-xs font-semibold text-soon">{eta.label}</span>;
  }

  if (eta.tone === "normal" && eta.minutes !== undefined) {
    return (
      <span className="flex items-baseline gap-0.5 tabular-nums" aria-label={eta.label}>
        <span className="font-sign text-[22px] leading-none font-bold text-fg">{eta.minutes}</span>
        <span className="text-xs text-fg-muted">分</span>
        {isLastBus && <span className="ml-1 rounded bg-surface-sunken px-1 text-[10px] text-fg-muted">末班</span>}
      </span>
    );
  }

  return <span className="text-xs text-fg-subtle">{eta.label}</span>;
}

import type { ReactNode } from "react";
import type { LangCode, ReviewStatus, TechStatus } from "@/lib/types/db";
import { LANG_LABEL } from "@/lib/language";

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{children}</h2>
      {action}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow mb-2">{children}</p>;
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "gold" }) {
  const tones = {
    default: "border-line text-ink-2 bg-surface",
    accent: "border-accent/40 text-accent bg-accent/10",
    gold: "border-gold/40 text-gold bg-gold/10",
  };
  return (
    <span className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 font-mono text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function LangChip({ code }: { code: LangCode | string }) {
  const isLatam = code === "es-419" || code === "es-MX";
  return <Chip tone={isLatam ? "accent" : "default"}>{LANG_LABEL[code] ?? code}</Chip>;
}

const TECH_TONE: Record<TechStatus, string> = {
  online: "text-good",
  degraded: "text-warn",
  offline: "text-crit",
  unknown: "text-ink-3",
};
export function TechDot({ status }: { status: TechStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${TECH_TONE[status]}`}>
      <span className="h-2 w-2 rounded-full bg-current" /> {status}
    </span>
  );
}

const REVIEW_TONE: Record<ReviewStatus, string> = {
  approved: "text-good border-good/30 bg-good/10",
  pending: "text-warn border-warn/30 bg-warn/10",
  in_review: "text-gold border-gold/30 bg-gold/10",
  rejected: "text-crit border-crit/30 bg-crit/10",
};
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`rounded-pill border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${REVIEW_TONE[status]}`}>
      {status}
    </span>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line/80 bg-surface/40 px-6 py-16 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="text-base font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

export function CardSkeleton() {
  return <div className="skeleton aspect-[2/3] w-full rounded-card" />;
}

export function RowSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-flow-col auto-cols-[140px] gap-3 sm:auto-cols-[170px]">
      {Array.from({ length: n }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

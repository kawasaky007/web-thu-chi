import Link from "next/link";

import { cn } from "@/lib/cn";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      aria-label="Thu Chi Gia Đình - Tổng quan"
      className={cn("inline-flex items-center gap-3", className)}
      href="/"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-paper shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
        <span className="brand-mark" aria-hidden="true" />
      </span>
      {!compact ? (
        <span>
          <span className="block text-sm font-extrabold tracking-[-0.025em] text-ink">
            Thu Chi Gia Đình
          </span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-forest/46">
            Forest Finance
          </span>
        </span>
      ) : null}
    </Link>
  );
}

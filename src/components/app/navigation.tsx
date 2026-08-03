"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  LayoutGrid,
  ReceiptText,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

export const navigationItems: Array<{
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}> = [
  { href: "/", label: "Tổng quan", shortLabel: "Tổng", icon: ChartNoAxesCombined },
  { href: "/transactions", label: "Giao dịch", shortLabel: "Giao dịch", icon: ReceiptText },
  { href: "/categories", label: "Danh mục", shortLabel: "Danh mục", icon: LayoutGrid },
  { href: "/budgets", label: "Ngân sách", shortLabel: "Ngân sách", icon: Target },
  { href: "/profile", label: "Cá nhân", shortLabel: "Cá nhân", icon: UserRound },
];

function useIsActive(href: string) {
  const pathname = usePathname();
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function DesktopNavigation() {
  return (
    <nav aria-label="Điều hướng chính" className="mt-10 space-y-2">
      {navigationItems.map((item) => (
        <DesktopNavigationItem key={item.href} {...item} />
      ))}
    </nav>
  );
}

function DesktopNavigationItem({ href, label, icon: Icon }: (typeof navigationItems)[number]) {
  const active = useIsActive(href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition",
        active
          ? "bg-forest text-paper shadow-[0_14px_34px_rgba(31,61,43,0.2)]"
          : "text-forest/62 hover:bg-forest/7 hover:text-forest",
      )}
      href={href}
    >
      <Icon aria-hidden="true" className={cn("size-5", active ? "text-mint" : "text-forest/46")} />
      {label}
      {active ? <span className="ml-auto size-1.5 rounded-full bg-yellow" /> : null}
    </Link>
  );
}

export function MobileNavigation() {
  return (
    <nav
      aria-label="Điều hướng chính trên điện thoại"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-5 rounded-[1.65rem] border border-forest/10 bg-paper-raised/94 px-1.5 py-1.5 shadow-[0_22px_70px_rgba(31,61,43,0.22)] backdrop-blur-2xl lg:hidden"
    >
      {navigationItems.map((item) => (
        <MobileNavigationItem key={item.href} {...item} />
      ))}
    </nav>
  );
}

function MobileNavigationItem({
  href,
  shortLabel,
  icon: Icon,
}: (typeof navigationItems)[number]) {
  const active = useIsActive(href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[9px] font-extrabold tracking-[-0.02em] transition",
        active ? "bg-forest text-paper" : "text-forest/52 hover:bg-forest/6",
      )}
      href={href}
    >
      <Icon aria-hidden="true" className={cn("size-5", active && "text-mint")} />
      <span className="max-w-full truncate">{shortLabel}</span>
    </Link>
  );
}

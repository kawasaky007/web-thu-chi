"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

/** Đặt bên trong 1 <Link className="relative ..."> để hiện chỉ báo đang tải
 * ngay tại link đó trong lúc Next.js điều hướng cùng trang (đổi searchParams).
 * loading.tsx không tự kích hoạt lại cho kiểu điều hướng này. */
export function LinkPendingOverlay({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      className={cn(
        "absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-paper-raised/85 backdrop-blur-[1px]",
        className,
      )}
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-indigo" />
      <span className="sr-only">Đang tải...</span>
    </span>
  );
}

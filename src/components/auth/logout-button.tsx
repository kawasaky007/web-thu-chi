"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

interface LogoutButtonProps {
  variant?: "danger" | "ghost" | "sidebar";
  profileName?: string;
  email?: string;
  initials?: string;
}

export function LogoutButton({ variant = "danger", ...profile }: LogoutButtonProps) {
  return (
    <form action={logoutAction} className={variant === "sidebar" ? "mt-4" : "w-full"}>
      <LogoutButtonContent variant={variant} {...profile} />
    </form>
  );
}

function LogoutButtonContent({
  variant,
  profileName,
  email,
  initials,
}: Required<Pick<LogoutButtonProps, "variant">> & Omit<LogoutButtonProps, "variant">) {
  const { pending } = useFormStatus();

  if (variant === "sidebar") {
    return (
      <button
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-forest/56 transition hover:bg-forest/6 disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        <span className="grid size-9 place-items-center rounded-full bg-mist text-xs font-extrabold text-forest">
          {initials || "TC"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ink">{profileName || "Tài khoản"}</span>
          <span className="block truncate text-[11px] font-semibold text-ink/42">
            {pending ? "Đang đăng xuất…" : email || "Đăng xuất"}
          </span>
        </span>
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <LogOut aria-hidden="true" className="size-4" />
        )}
      </button>
    );
  }

  return (
    <Button
      className="w-full"
      disabled={pending}
      type="submit"
      variant={variant === "danger" ? "danger" : "ghost"}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <LogOut aria-hidden="true" className="size-4" />
      )}
      {pending ? "Đang đăng xuất…" : "Đăng xuất"}
    </Button>
  );
}

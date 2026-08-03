"use client";

import { LockKeyhole, LogIn, Mail } from "lucide-react";
import { useActionState } from "react";

import { loginAction } from "@/app/(auth)/actions";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import type { AuthActionState } from "@/lib/auth/action-state";

export function LoginForm({
  nextPath,
  initialMessage,
}: {
  nextPath: string;
  initialMessage?: string;
}) {
  const initialState: AuthActionState = initialMessage
    ? { status: "error", message: initialMessage }
    : { status: "idle" };
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <input name="next" type="hidden" value={nextPath} />
      <AuthFeedback message={state.message} variant={state.status === "success" ? "success" : "error"} />
      <Input
        autoComplete="email"
        error={state.fieldErrors?.email}
        label="Email"
        leading={<Mail aria-hidden="true" className="size-4" />}
        name="email"
        placeholder="ban@example.com"
        required
        type="email"
      />
      <Input
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        label="Mật khẩu"
        leading={<LockKeyhole aria-hidden="true" className="size-4" />}
        name="password"
        placeholder="••••••••"
        required
        type="password"
      />
      <SubmitButton className="w-full" pendingLabel="Đang đăng nhập…">
        <LogIn aria-hidden="true" className="size-4" /> Đăng nhập
      </SubmitButton>
    </form>
  );
}

"use client";

import { LockKeyhole, Mail, UserPlus, UserRound } from "lucide-react";
import { useActionState } from "react";

import { registerAction } from "@/app/(auth)/actions";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { initialAuthActionState } from "@/lib/auth/action-state";

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialAuthActionState);

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <AuthFeedback message={state.message} variant={state.status === "success" ? "success" : "error"} />
      <Input
        autoComplete="name"
        error={state.fieldErrors?.fullName}
        label="Tên hiển thị"
        leading={<UserRound aria-hidden="true" className="size-4" />}
        maxLength={80}
        name="fullName"
        placeholder="Nguyễn Minh An"
        required
      />
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
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        hint="Tối thiểu 8 ký tự."
        label="Mật khẩu"
        leading={<LockKeyhole aria-hidden="true" className="size-4" />}
        minLength={8}
        name="password"
        placeholder="••••••••"
        required
        type="password"
      />
      <SubmitButton className="w-full" pendingLabel="Đang tạo tài khoản…">
        <UserPlus aria-hidden="true" className="size-4" /> Tạo tài khoản
      </SubmitButton>
    </form>
  );
}

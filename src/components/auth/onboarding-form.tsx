"use client";

import { House, KeyRound, Plus, UsersRound } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createHouseholdAction,
  joinHouseholdAction,
} from "@/app/(auth)/actions";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { LogoutButton } from "@/components/auth/logout-button";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialAuthActionState } from "@/lib/auth/action-state";
import { cn } from "@/lib/cn";

export function OnboardingForm({
  defaultHouseholdName,
  nextPath,
}: {
  defaultHouseholdName: string;
  nextPath: string;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [createState, createAction] = useActionState(
    createHouseholdAction,
    initialAuthActionState,
  );
  const [joinState, joinAction] = useActionState(
    joinHouseholdAction,
    initialAuthActionState,
  );

  return (
    <div className="mt-7">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-mist/72 p-1.5" role="tablist">
        <ModeButton active={mode === "create"} onClick={() => setMode("create")}>
          <Plus aria-hidden="true" className="size-4" /> Tạo mới
        </ModeButton>
        <ModeButton active={mode === "join"} onClick={() => setMode("join")}>
          <UsersRound aria-hidden="true" className="size-4" /> Nhập mã mời
        </ModeButton>
      </div>

      {mode === "create" ? (
        <form action={createAction} className="mt-5 space-y-5">
          <input name="next" type="hidden" value={nextPath} />
          <AuthFeedback message={createState.message} />
          <Input
            defaultValue={defaultHouseholdName}
            error={createState.fieldErrors?.householdName}
            hint="Bạn có thể đổi tên sau trong phần Cá nhân."
            label="Tên household"
            leading={<House aria-hidden="true" className="size-4" />}
            maxLength={60}
            name="householdName"
            required
          />
          <SubmitButton className="w-full" pendingLabel="Đang tạo household…">
            <Plus aria-hidden="true" className="size-4" /> Tạo household
          </SubmitButton>
        </form>
      ) : (
        <form action={joinAction} className="mt-5 space-y-5">
          <input name="next" type="hidden" value={nextPath} />
          <AuthFeedback message={joinState.message} />
          <Input
            autoCapitalize="characters"
            className="uppercase tracking-[0.16em]"
            error={joinState.fieldErrors?.inviteCode}
            hint="Mã gồm 6–8 chữ hoặc số, không phân biệt viết hoa."
            label="Mã mời"
            leading={<KeyRound aria-hidden="true" className="size-4" />}
            maxLength={10}
            name="inviteCode"
            placeholder="A7K9Q2"
            required
          />
          <SubmitButton className="w-full" pendingLabel="Đang tham gia…">
            <UsersRound aria-hidden="true" className="size-4" /> Tham gia household
          </SubmitButton>
        </form>
      )}

      <div className="mt-4 border-t border-forest/10 pt-4">
        <LogoutButton variant="ghost" />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      aria-selected={active}
      className={cn("w-full", active && "shadow-sm")}
      onClick={onClick}
      role="tab"
      size="sm"
      variant={active ? "secondary" : "ghost"}
    >
      {children}
    </Button>
  );
}

import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/onboarding-form";
import { Card, CardContent } from "@/components/ui/card";
import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { sanitizeNextPath } from "@/lib/supabase/route-guard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const membership = await getCurrentMembership();
  if (!membership) {
    redirect("/login?error=session_expired&next=%2Fonboarding");
  }

  const params = await searchParams;
  const nextPath = sanitizeNextPath(readParam(params.next));
  if (membership.profile?.household_id && membership.household) {
    redirect(nextPath);
  }

  const fullName = resolveProfileName(
    membership.profile,
    membership.metadataFullName || membership.email.split("@")[0],
  );

  return (
    <Card className="w-full">
      <CardContent className="p-5 sm:p-7">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo">
          Còn một bước
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.055em]">
          Chọn household
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-ink/52">
          Tạo không gian thu chi mới hoặc nhập mã mời để tham gia cùng gia đình.
        </p>

        <OnboardingForm
          defaultHouseholdName={`Gia đình của ${fullName}`}
          nextPath={nextPath}
        />
      </CardContent>
    </Card>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

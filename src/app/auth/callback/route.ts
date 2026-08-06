import { type NextRequest, NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth/profile";
import { sanitizeNextPath } from "@/lib/supabase/route-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  if (code && !request.nextUrl.searchParams.has("error")) {
    const supabase = await createServerSupabaseClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      const { data, error: userError } = await supabase.auth.getUser();

      if (!userError && data.user) {
        try {
          const profile = await ensureUserProfile(supabase, data.user);
          if (!profile.household_id) {
            return NextResponse.redirect(new URL(buildOnboardingLocation(nextPath), request.url));
          }
          return NextResponse.redirect(new URL(nextPath, request.url));
        } catch {
          await supabase.auth.signOut({ scope: "local" });
        }
      }
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "auth_callback_failed");
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

function buildOnboardingLocation(nextPath: string) {
  if (nextPath === "/") return "/onboarding";
  return `/onboarding?next=${encodeURIComponent(nextPath)}`;
}

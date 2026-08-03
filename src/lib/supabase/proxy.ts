import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { readPublicSupabaseConfig } from "@/lib/env";
import { decideRoute } from "@/lib/supabase/route-guard";
import type { Database } from "@/types/database";

interface SupabaseCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export async function updateSupabaseSession(request: NextRequest) {
  const { url, anonKey } = readPublicSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        setResponseCookies(response, cookiesToSet);
      },
    },
  });

  let isAuthenticated = false;

  try {
    const { data, error } = await supabase.auth.getClaims();
    isAuthenticated = !error && Boolean(data?.claims.sub);
  } catch {
    // Fail closed when the session cannot be verified.
  }

  const decision = decideRoute({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    isAuthenticated,
  });

  if (decision.type === "redirect") {
    const redirectResponse = NextResponse.redirect(new URL(decision.location, request.url));
    copyResponseCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

function setResponseCookies(response: NextResponse, cookies: SupabaseCookie[]) {
  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
}

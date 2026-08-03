const protectedRoutes = [
  "/",
  "/transactions",
  "/categories",
  "/budgets",
  "/profile",
  "/backup",
  "/recurring",
  "/goals",
  "/onboarding",
] as const;

const authEntryRoutes = ["/login", "/register"] as const;

interface RouteContext {
  pathname: string;
  search?: string;
  isAuthenticated: boolean;
}

export type RouteDecision =
  | { type: "allow" }
  | { type: "redirect"; location: string };

export function decideRoute({
  pathname,
  search = "",
  isAuthenticated,
}: RouteContext): RouteDecision {
  if (!isAuthenticated && isProtectedPathname(pathname)) {
    const nextPath = `${pathname}${search}`;
    return {
      type: "redirect",
      location: `/login?next=${encodeURIComponent(nextPath)}`,
    };
  }

  if (isAuthenticated && isAuthEntryPathname(pathname)) {
    return { type: "redirect", location: "/" };
  }

  return { type: "allow" };
}

export function sanitizeNextPath(value: string | null, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const baseUrl = new URL("https://thu-chi.local");
    const nextUrl = new URL(value, baseUrl);

    if (nextUrl.origin !== baseUrl.origin) {
      return fallback;
    }

    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  } catch {
    return fallback;
  }
}

function isProtectedPathname(pathname: string) {
  return protectedRoutes.some((route) => {
    return route === "/" ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);
  });
}

function isAuthEntryPathname(pathname: string) {
  return authEntryRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

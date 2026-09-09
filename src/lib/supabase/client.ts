"use client";

import { createBrowserClient } from "@supabase/ssr";

import { readPublicSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";

export function createBrowserSupabaseClient() {
  // Phải viết trực tiếp process.env.NEXT_PUBLIC_* ở đây (không qua tham số
  // gián tiếp) để Next.js nhúng đúng giá trị vào bundle trình duyệt.
  const { url, anonKey } = readPublicSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return createBrowserClient<Database>(url, anonKey);
}

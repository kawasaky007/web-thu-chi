import { describe, expect, it } from "vitest";

import { readPublicSupabaseConfig } from "./env";

describe("readPublicSupabaseConfig", () => {
  it("trả về cấu hình đã được làm sạch", () => {
    expect(
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: " abcdefghijklmnopqrstuvwxyz ",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      anonKey: "abcdefghijklmnopqrstuvwxyz",
    });
  });

  it("không đưa giá trị nhạy cảm vào thông báo thiếu cấu hình", () => {
    expect(() => readPublicSupabaseConfig({})).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  });

  it("từ chối URL không hợp lệ", () => {
    expect(() =>
      readPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "abcdefghijklmnopqrstuvwxyz",
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL không phải URL hợp lệ.");
  });
});

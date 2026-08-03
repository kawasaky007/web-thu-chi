const publicEnvironmentKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

type PublicEnvironmentSource = Record<string, string | undefined>;

export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

export function readPublicSupabaseConfig(
  source: PublicEnvironmentSource = process.env,
): PublicSupabaseConfig {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const missingKeys = publicEnvironmentKeys.filter((key) => !source[key]?.trim());
  if (missingKeys.length > 0) {
    throw new Error(`Thiếu biến môi trường: ${missingKeys.join(", ")}`);
  }

  if (!isHttpUrl(url!)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL không phải URL hợp lệ.");
  }

  if (anonKey!.includes("your-") || anonKey!.length < 20) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY chưa được cấu hình hợp lệ.");
  }

  return { url: url!, anonKey: anonKey! };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

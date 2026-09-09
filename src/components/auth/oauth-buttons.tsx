"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { AuthFeedback } from "@/components/auth/auth-feedback";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type OAuthProvider = "google" | "apple";

const providerLabels: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export function OAuthButtons({ nextPath }: { nextPath: string }) {
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function signIn(provider: OAuthProvider) {
    setPendingProvider(provider);
    setErrorMessage(undefined);

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl.toString() },
      });

      if (!error) return;
      // Nuốt lỗi hoàn toàn khiến provider chưa bật trông giống hệt lỗi mạng.
      console.error(`Đăng nhập ${provider} thất bại:`, error);
    } catch (unexpectedError) {
      console.error(`Đăng nhập ${provider} lỗi ngoài dự kiến:`, unexpectedError);
    }

    setPendingProvider(null);
    setErrorMessage(`Không thể đăng nhập bằng ${providerLabels[provider]}. Vui lòng thử lại.`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/32">
        <span aria-hidden="true" className="h-px flex-1 bg-forest/10" />
        <span>Hoặc tiếp tục với</span>
        <span aria-hidden="true" className="h-px flex-1 bg-forest/10" />
      </div>

      {errorMessage ? <AuthFeedback message={errorMessage} /> : null}

      {/* Nút Apple chưa hiển thị: Sign in with Apple cần Apple Developer Program
          và client secret dạng JWT phải gia hạn định kỳ, sẽ bật ở đợt sau. */}
      <div className="grid gap-3">
        <OAuthButton
          disabled={pendingProvider !== null}
          icon={<GoogleMark />}
          label="Google"
          loading={pendingProvider === "google"}
          onClick={() => signIn("google")}
        />
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path d="M21.35 12.27c0-.79-.07-1.54-.23-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z" fill="#4285F4" />
      <path d="M12 21.5c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z" fill="#34A853" />
      <path d="M6.54 13.59A5.86 5.86 0 0 1 6.23 12c0-.55.1-1.08.31-1.59V7.88H3.3A9.49 9.49 0 0 0 2.25 12c0 1.48.35 2.88 1.05 4.12l3.24-2.53Z" fill="#FBBC05" />
      <path d="M12 6.38c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.49 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.38l3.24 2.53C7.31 8.1 9.46 6.38 12 6.38Z" fill="#EA4335" />
    </svg>
  );
}

function OAuthButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={`Đăng nhập bằng ${label}`}
      aria-busy={loading}
      className="w-full border-forest/12 bg-paper-raised/78 text-ink hover:bg-mist/65"
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="secondary"
    >
      {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : icon}
      {loading ? "Đang chuyển..." : label}
    </Button>
  );
}

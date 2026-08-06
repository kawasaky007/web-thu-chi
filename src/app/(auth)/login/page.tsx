import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Card, CardContent } from "@/components/ui/card";
import { sanitizeNextPath } from "@/lib/supabase/route-guard";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(readParam(params.next));
  const initialMessage = getLoginMessage(readParam(params.error));

  return (
    <Card className="w-full">
      <CardContent className="p-5 sm:p-7">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo">Chào mừng trở lại</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.055em]">Đăng nhập</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-ink/52">
          Tiếp tục quản lý dòng tiền của gia đình trên mọi thiết bị.
        </p>

        <LoginForm initialMessage={initialMessage} nextPath={nextPath} />
        <OAuthButtons nextPath={nextPath} />

        <p className="mt-6 text-center text-sm font-medium text-ink/52">
          Chưa có tài khoản?{" "}
          <Link className="font-extrabold text-forest hover:underline" href="/register">Tạo tài khoản</Link>
        </p>
      </CardContent>
    </Card>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function getLoginMessage(error: string | null) {
  if (error === "auth_callback_failed") {
    return "Đăng nhập bằng Google hoặc Apple không thành công. Vui lòng thử lại.";
  }
  if (error === "session_expired") {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  return undefined;
}

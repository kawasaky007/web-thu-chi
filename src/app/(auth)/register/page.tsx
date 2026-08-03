import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <Card className="w-full">
      <CardContent className="p-5 sm:p-7">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo">Bắt đầu rõ ràng</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.055em]">Tạo tài khoản</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-ink/52">
          Tạo hồ sơ trước, sau đó bạn có thể lập household hoặc tham gia bằng mã mời.
        </p>

        <RegisterForm />

        <p className="mt-6 text-center text-sm font-medium text-ink/52">
          Đã có tài khoản?{" "}
          <Link className="font-extrabold text-forest hover:underline" href="/login">Đăng nhập</Link>
        </p>
      </CardContent>
    </Card>
  );
}

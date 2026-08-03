import Link from "next/link";

import { EmptyState } from "@/components/ui/status-state";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4" id="main-content" tabIndex={-1}>
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-forest px-5 text-sm font-extrabold text-paper shadow-[0_14px_32px_rgba(31,61,43,0.22)]"
            href="/"
          >
            Về tổng quan
          </Link>
        }
        description="Đường dẫn này không tồn tại hoặc đã được thay đổi trong quá trình migrate."
        title="Không tìm thấy trang"
      />
    </main>
  );
}

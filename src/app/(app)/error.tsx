"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/status-state";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      action={<Button onClick={reset} variant="secondary">Thử lại</Button>}
      description="Giao diện chưa thể tải đầy đủ. Bạn có thể thử lại mà không mất dữ liệu đã nhập."
      title="Có lỗi xảy ra"
    />
  );
}

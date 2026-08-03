import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Thu Chi Gia Đình",
    short_name: "Thu Chi",
    description: "Quản lý thu chi gia đình rõ ràng trên mọi thiết bị.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F5F1E8",
    theme_color: "#1F3D2B",
    lang: "vi",
    categories: ["finance", "productivity", "utilities"],
    prefer_related_applications: false,
    shortcuts: [
      {
        name: "Thêm giao dịch",
        short_name: "Thêm giao dịch",
        description: "Mở nhanh biểu mẫu ghi khoản thu hoặc chi mới.",
        url: "/transactions?new=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Xem ngân sách",
        short_name: "Ngân sách",
        description: "Kiểm tra tiến độ ngân sách tháng hiện tại.",
        url: "/budgets",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Giao dịch định kỳ",
        short_name: "Định kỳ",
        description: "Kiểm tra và ghi các khoản thu chi đã đến hạn.",
        url: "/recurring",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Mục tiêu tiết kiệm",
        short_name: "Mục tiêu",
        description: "Theo dõi quỹ khẩn cấp và các kế hoạch tích lũy.",
        url: "/goals",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Thu Chi Gia Đình",
    template: "%s · Thu Chi Gia Đình",
  },
  description:
    "Ứng dụng quản lý thu chi gia đình mobile-first, sử dụng Next.js và Supabase.",
  applicationName: "Thu Chi Gia Đình",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Thu Chi",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1F3D2B",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={beVietnamPro.variable} suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>
        <RegisterServiceWorker />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

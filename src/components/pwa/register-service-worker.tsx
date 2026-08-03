"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/components/pwa/use-online-status";

export function RegisterServiceWorker() {
  const online = useOnlineStatus();
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const suppressInstallPrompt = (event: Event) => event.preventDefault();
    window.addEventListener("beforeinstallprompt", suppressInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", suppressInstallPrompt);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            setUpdateRegistration(registration);
          }

          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;

            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateRegistration(registration);
              }
            });
          });

          void registration.update();
        })
        .catch(() => {
          // The online app remains usable if service worker registration fails.
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  const activateUpdate = () => {
    const worker = updateRegistration?.waiting;
    if (!worker) return;

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    worker.postMessage({ type: "SKIP_WAITING" });
  };

  if (online && !updateRegistration) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[90] mx-auto flex max-w-md flex-col gap-2"
    >
      {!online ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-yellow/50 bg-forest px-4 py-3 text-sm font-bold text-paper shadow-[0_18px_52px_rgba(31,61,43,0.28)]" role="status">
          <CloudOff aria-hidden="true" className="size-5 shrink-0 text-yellow" />
          <span>Bạn đang offline. Nháp giao dịch vẫn được giữ trên thiết bị.</span>
        </div>
      ) : null}

      {online && updateRegistration ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-mint/40 bg-forest px-4 py-3 text-sm font-bold text-paper shadow-[0_18px_52px_rgba(31,61,43,0.28)]" role="status">
          <RefreshCw aria-hidden="true" className="size-5 shrink-0 text-mint" />
          <span className="min-w-0 flex-1">Đã có phiên bản mới.</span>
          <Button className="min-h-9 px-3 text-xs" onClick={activateUpdate} size="sm" variant="accent">
            Cập nhật
          </Button>
        </div>
      ) : null}
    </div>
  );
}

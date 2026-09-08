"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, ShieldCheck } from "lucide-react";

import { savePushSubscriptionAction } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { initialProfileActionState } from "@/lib/profile/action-state";
import { subscribeToPushNotifications } from "@/lib/notifications/push-client";
import {
  getRecurringReminderPermission,
  requestRecurringReminderPermission,
  type ReminderPermission,
} from "@/lib/pwa/recurring-reminder";

export function NotificationSettings() {
  const [permission, setPermission] = useState<ReminderPermission | "loading">("loading");
  const [pending, setPending] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setPermission(getRecurringReminderPermission()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const enableNotifications = async () => {
    setPending(true);
    try {
      const result = await requestRecurringReminderPermission();
      setPermission(result);
      if (result !== "granted") {
        if (result === "denied") {
          notify("Trình duyệt đang chặn thông báo. Bạn có thể mở lại trong cài đặt website.", "error");
        }
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const subscription = vapidPublicKey ? await subscribeToPushNotifications(vapidPublicKey) : null;
      if (!subscription) {
        notify("Đã bật nhắc hạn trên thiết bị này. Thiết bị chưa hỗ trợ nhận thông báo khi đóng app.");
        return;
      }

      const formData = new FormData();
      formData.set("subscription", JSON.stringify(subscription.toJSON()));
      const saveResult = await savePushSubscriptionAction(initialProfileActionState, formData);
      notify(
        saveResult.status === "success" ? "Đã bật thông báo." : "Đã cấp quyền nhưng chưa lưu được thiết bị, thử bật lại sau.",
        saveResult.status === "success" ? "success" : "error",
      );
    } catch {
      notify("Có lỗi khi bật thông báo, vui lòng thử lại.", "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-[1.75rem] border border-forest/10 bg-paper-raised/72 p-5 shadow-[0_18px_50px_rgba(31,61,43,0.07)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-4">
        <div className={permission === "granted" ? "grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-soft text-income" : "grid size-11 shrink-0 place-items-center rounded-2xl bg-mist text-forest"}>
          {permission === "denied" || permission === "unsupported" ? <BellOff aria-hidden="true" className="size-5" /> : <BellRing aria-hidden="true" className="size-5" />}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-extrabold">Thông báo</h2>
            {permission === "granted" ? <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2 py-1 text-[10px] font-extrabold uppercase text-income"><ShieldCheck aria-hidden="true" className="size-3" />Đã bật</span> : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-ink/52">
            Nhận thông báo khi thành viên household thêm giao dịch mới và khi có lịch định kỳ đến hạn, kể cả lúc đã đóng app.
          </p>
          {permission === "unsupported" ? <p className="mt-2 text-xs font-bold text-expense">Thiết bị này chưa hỗ trợ thông báo web; trên iPhone hãy cài PWA ra màn hình chính trước.</p> : null}
          {permission === "denied" ? <p className="mt-2 text-xs font-bold text-expense">Quyền thông báo đã bị chặn trong cài đặt trình duyệt.</p> : null}
        </div>
      </div>
      {permission === "default" || permission === "granted" ? (
        <Button disabled={pending} onClick={enableNotifications} variant="secondary">
          {pending ? "Đang bật..." : permission === "granted" ? "Đăng ký thiết bị này" : "Bật thông báo"}
        </Button>
      ) : null}
    </section>
  );
}

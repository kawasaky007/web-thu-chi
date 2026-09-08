import webpush, { WebPushError } from "web-push";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function sendTransactionPushNotifications(
  supabase: SupabaseClient<Database>,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  configureWebPush();

  const { data: targets, error } = await supabase.rpc("get_household_push_targets");
  if (error) throw error;
  if (!targets || targets.length === 0) return;

  const serializedPayload = JSON.stringify(payload);
  await Promise.all(targets.map(async (target) => {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth_key } },
        serializedPayload,
      );
    } catch (sendError) {
      if (sendError instanceof WebPushError && (sendError.statusCode === 404 || sendError.statusCode === 410)) {
        await supabase.rpc("delete_household_push_subscription", { p_subscription_id: target.subscription_id });
      }
      // Một thiết bị gửi lỗi (mạng, 5xx, ...) không được làm hỏng các thiết bị khác.
    }
  }));
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  const missing = [
    !publicKey && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    !privateKey && "VAPID_PRIVATE_KEY",
    !subject && "VAPID_SUBJECT",
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(", ")}`);
  }
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
}

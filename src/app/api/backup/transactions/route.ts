import type { NextRequest } from "next/server";

import { getCurrentMembership } from "@/lib/auth/session";
import { getTransactionBackupRows } from "@/lib/backup/data";
import { createTransactionBackup, serializeTransactionsCsv } from "@/lib/backup/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const membership = await getCurrentMembership();
  if (!membership) return Response.json({ message: "AUTH_REQUIRED" }, { status: 401, headers: noStoreHeaders() });
  if (!membership.household || !membership.profile?.household_id) {
    return Response.json({ message: "HOUSEHOLD_REQUIRED" }, { status: 409, headers: noStoreHeaders() });
  }

  const format = request.nextUrl.searchParams.get("format");
  if (format !== "json" && format !== "csv") {
    return Response.json({ message: "FORMAT_NOT_SUPPORTED" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const rows = await getTransactionBackupRows(
      await createServerSupabaseClient(),
      membership.profile.household_id,
    );
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const fileName = `thu-chi-${slugify(membership.household.name)}-${date}.${format}`;
    const headers = {
      ...noStoreHeaders(),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Content-Type-Options": "nosniff",
    };

    if (format === "csv") {
      return new Response(serializeTransactionsCsv(rows), {
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    const backup = createTransactionBackup(membership.household.name, rows);
    return new Response(JSON.stringify(backup, null, 2), {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json({ message: "EXPORT_FAILED" }, { status: 500, headers: noStoreHeaders() });
  }
}

function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "gia-dinh";
}

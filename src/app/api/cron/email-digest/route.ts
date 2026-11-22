import { createHash, timingSafeEqual } from "node:crypto";

import { emailDailyDigests } from "@/lib/email/notifications";
import { siteOrigin } from "@/lib/email/origin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Email digest scheduler is not configured." }, { status: 503 });
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${secret}`))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await emailDailyDigests({ origin: siteOrigin() });
    return Response.json(counts);
  } catch {
    console.error("Email digest dispatch failed");
    return Response.json({ error: "Could not dispatch email digests.", users: 0, emailed: 0, skipped: 0, failed: 1 }, { status: 500 });
  }
}

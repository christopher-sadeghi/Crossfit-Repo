import { NextResponse } from "next/server";

import { siteOrigin } from "@/lib/email/origin";
import { getStripe } from "@/lib/payments/stripe";
import { createCoachPaymentActions } from "@/lib/payments/coach-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

export async function GET() {
  const result = await createCoachPaymentActions({
    getViewer,
    createAdminClient,
    getStripe,
    siteOrigin,
  }).startConnect();
  if (result.url) return NextResponse.redirect(result.url);
  return NextResponse.redirect(new URL("/settings", siteOrigin()));
}

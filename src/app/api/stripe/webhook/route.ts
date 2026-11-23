import { NextResponse } from "next/server";

import { emailNewNotifications } from "@/lib/email/notifications";
import { pushNewNotifications } from "@/lib/push/send";
import { processStripeEvent } from "@/lib/payments/webhook-core";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Payments aren't switched on yet." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    await processStripeEvent(event, {
      admin: createAdminClient(),
      stripe,
      pushNewNotifications,
      emailNewNotifications,
    });
    return NextResponse.json({ received: true });
  } catch {
    console.error("Stripe webhook processing failed");
    return NextResponse.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}

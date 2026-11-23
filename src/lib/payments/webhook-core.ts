import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { coachRecipientId } from "@/lib/coach-recipient";
import type { Database } from "@/lib/supabase/database.types";

import type { PaymentsGateway } from "./stripe";

type AdminClient = SupabaseClient<Database>;
type Dependencies = {
  admin: AdminClient;
  stripe: PaymentsGateway;
  pushNewNotifications: (input: { athleteId: string; kind: string }) => Promise<unknown>;
  emailNewNotifications: (input: { athleteId: string; kind: string }) => Promise<unknown>;
};

type WebhookResult = "processed" | "duplicate" | "ignored";
type Metadata = Record<string, string | undefined>;

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

function stripeStatus(status: string): Database["public"]["Tables"]["athlete_memberships"]["Row"]["status"] {
  switch (status) {
    case "incomplete":
    case "incomplete_expired":
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "paused":
      return status;
    default:
      return "incomplete";
  }
}

function periodEnd(subscription: Stripe.Subscription) {
  const current = subscription as Stripe.Subscription & { current_period_end?: number };
  const item = subscription.items.data[0] as (typeof subscription.items.data)[number] & { current_period_end?: number };
  const seconds = current.current_period_end ?? item?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export async function processStripeEvent(event: Stripe.Event, dependencies: Dependencies): Promise<WebhookResult> {
  const accountId = event.account;
  if (!accountId) return "ignored";

  const { admin, stripe } = dependencies;
  const { data: coachAccount, error: accountError } = await admin.from("coach_stripe_accounts")
    .select("coach_id, stripe_account_id")
    .eq("stripe_account_id", accountId)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!coachAccount) return "ignored";
  const connectedAccount = coachAccount;

  let eventRecorded = false;
  try {
    const { data: inserted, error: insertError } = await admin.from("stripe_webhook_events")
      .upsert({ id: event.id }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw insertError;
    eventRecorded = Boolean(inserted?.length);
    if (!eventRecorded) return "duplicate";

    const connectedOptions = { stripeAccount: connectedAccount.stripe_account_id };

    async function upsertMembership(subscription: Stripe.Subscription, metadataFallback: Metadata = {}) {
      const metadata: Metadata = { ...metadataFallback, ...subscription.metadata };
      const athleteId = metadata.athlete_id;
      if (!athleteId || (metadata.coach_id && metadata.coach_id !== connectedAccount.coach_id)) return;
      const { data: athlete, error: athleteError } = await admin.from("athletes")
        .select("id, coach_id")
        .eq("id", athleteId)
        .maybeSingle();
      if (athleteError) throw athleteError;
      if (!athlete || athlete.coach_id !== connectedAccount.coach_id) return;

      let planId: string | null = null;
      if (metadata.plan_id) {
        const { data: plan, error: planError } = await admin.from("membership_plans")
          .select("id")
          .eq("id", metadata.plan_id)
          .eq("coach_id", connectedAccount.coach_id)
          .maybeSingle();
        if (planError) throw planError;
        planId = plan?.id ?? null;
      }
      if (!planId) {
        const priceId = subscription.items.data[0]?.price.id;
        if (priceId) {
          const { data: plan, error: planError } = await admin.from("membership_plans")
            .select("id")
            .eq("stripe_price_id", priceId)
            .eq("coach_id", connectedAccount.coach_id)
            .maybeSingle();
          if (planError) throw planError;
          planId = plan?.id ?? null;
        }
      }

      const customerId = objectId(subscription.customer);
      if (!customerId) return;
      const { error } = await admin.from("athlete_memberships").upsert({
        athlete_id: athlete.id,
        coach_id: connectedAccount.coach_id,
        plan_id: planId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        status: stripeStatus(subscription.status),
        current_period_end: periodEnd(subscription),
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }, { onConflict: "stripe_subscription_id" });
      if (error) throw error;
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const { error } = await admin.from("coach_stripe_accounts").update({
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
        updated_at: new Date().toISOString(),
      }).eq("coach_id", connectedAccount.coach_id);
      if (error) throw error;
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        const subscriptionId = objectId(session.subscription);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, connectedOptions);
          await upsertMembership(subscription, session.metadata ?? {});
        }
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const payload = event.data.object as Stripe.Subscription;
      const subscription = await stripe.subscriptions.retrieve(payload.id, {}, connectedOptions);
      await upsertMembership(subscription);
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
        parent?: { subscription_details?: { subscription?: string | Stripe.Subscription | null } | null } | null;
      };
      const subscriptionId = objectId(invoice.subscription)
        ?? objectId(invoice.parent?.subscription_details?.subscription);
      if (!subscriptionId) return "processed";
      const { data: membership, error: membershipError } = await admin.from("athlete_memberships")
        .select("athlete_id, coach_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership || membership.coach_id !== coachAccount.coach_id) return "processed";

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, connectedOptions);
      await upsertMembership(subscription);
      if (
        subscription.status !== "past_due" &&
        subscription.status !== "unpaid" &&
        subscription.status !== "incomplete"
      ) return "processed";

      const { data: athlete, error: athleteError } = await admin.from("athletes")
        .select("id, user_id, first_name, last_name, coach_id, assigned_coach_id")
        .eq("id", membership.athlete_id)
        .maybeSingle();
      if (athleteError) throw athleteError;
      if (!athlete || athlete.coach_id !== coachAccount.coach_id) return "processed";
      const athleteName = `${athlete.first_name} ${athlete.last_name}`.trim();
      const notifications = [{
        recipient_id: coachRecipientId({ coach_id: athlete.coach_id, assigned_coach_id: athlete.assigned_coach_id }),
        athlete_id: athlete.id,
        kind: "payment_failed" as const,
        title: `Payment failed for ${athleteName}`,
        body: "An athlete's membership payment failed.",
        link: `/athletes/${athlete.id}`,
      }];
      if (athlete.user_id) {
        notifications.push({
          recipient_id: athlete.user_id,
          athlete_id: athlete.id,
          kind: "payment_failed",
          title: "Your payment failed",
          body: "Your payment failed — update your card.",
          link: "/athlete/membership",
        });
      }
      const { error: notificationError } = await admin.from("notifications").insert(notifications);
      if (notificationError) throw notificationError;
      await Promise.all([
        dependencies.pushNewNotifications({ athleteId: athlete.id, kind: "payment_failed" }).catch(() => {
          console.error("Payment failure push dispatch failed");
        }),
        dependencies.emailNewNotifications({ athleteId: athlete.id, kind: "payment_failed" }).catch(() => {
          console.error("Payment failure email dispatch failed");
        }),
      ]);
    }
    return "processed";
  } catch (error) {
    if (eventRecorded) {
      const { error: deleteError } = await admin.from("stripe_webhook_events").delete().eq("id", event.id);
      if (deleteError) console.error("Stripe webhook idempotency cleanup failed");
    }
    throw error;
  }
}

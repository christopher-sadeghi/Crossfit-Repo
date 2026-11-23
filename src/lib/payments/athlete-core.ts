import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { AthleteViewer, Viewer } from "@/lib/viewer";

import type { PaymentsGateway } from "./stripe";

type AdminClient = SupabaseClient<Database>;
type Dependencies = {
  getViewer: () => Promise<Viewer>;
  createAdminClient: () => AdminClient;
  getStripe: () => PaymentsGateway | null;
  siteOrigin: () => string;
};
type ActionResult = { error?: string; url?: string };

const NOT_CONFIGURED = "Payments aren't switched on yet.";
const LIVE_STATUSES = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"] as const;

function isAthlete(viewer: Viewer): viewer is AthleteViewer {
  return viewer?.kind === "athlete";
}

export function createAthletePaymentActions(dependencies: Dependencies) {
  async function athleteContext() {
    const viewer = await dependencies.getViewer();
    if (!isAthlete(viewer)) return { error: "Only athletes can manage memberships." } as const;
    const admin = dependencies.createAdminClient();
    const { data: athlete, error: athleteError } = await admin.from("athletes")
      .select("id, coach_id, first_name, last_name, email, status")
      .eq("id", viewer.athleteId)
      .maybeSingle();
    if (athleteError || !athlete || athlete.status !== "active" || athlete.coach_id !== viewer.coachId) {
      return { error: "Your athlete account isn't active." } as const;
    }
    const { data: account, error: accountError } = await admin.from("coach_stripe_accounts")
      .select("stripe_account_id, charges_enabled, portal_configuration_id")
      .eq("coach_id", athlete.coach_id)
      .maybeSingle();
    if (accountError) return { error: "Couldn't load your coach's payment account." } as const;
    return { viewer, athlete, account, admin };
  }

  async function hasLiveMembership(admin: AdminClient, athleteId: string) {
    const { data, error } = await admin.from("athlete_memberships")
      .select("id")
      .eq("athlete_id", athleteId)
      .in("status", [...LIVE_STATUSES])
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async function createCheckout(planId: string): Promise<ActionResult> {
    const context = await athleteContext();
    if ("error" in context) return context;
    const stripe = dependencies.getStripe();
    if (!stripe) return { error: NOT_CONFIGURED };
    const { athlete, account, admin } = context;
    if (!account?.charges_enabled) return { error: "Your coach hasn't set up payments yet." };
    if (typeof planId !== "string" || !planId.trim()) return { error: "Choose a membership plan." };

    try {
      const live = await hasLiveMembership(admin, athlete.id);
      if (live) return { error: "You already have a current membership." };
      const { data: plan, error: planError } = await admin.from("membership_plans")
        .select("id, coach_id, name, stripe_price_id")
        .eq("id", planId)
        .eq("coach_id", athlete.coach_id)
        .eq("active", true)
        .maybeSingle();
      if (planError || !plan) return { error: "This membership plan is no longer available." };

      const options = { stripeAccount: account.stripe_account_id };
      const { data: savedCustomer, error: customerError } = await admin.from("athlete_stripe_customers")
        .select("stripe_customer_id")
        .eq("athlete_id", athlete.id)
        .eq("coach_id", athlete.coach_id)
        .maybeSingle();
      if (customerError) return { error: "Couldn't load your billing details." };
      let customerId = savedCustomer?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          ...(athlete.email ? { email: athlete.email } : {}),
          name: `${athlete.first_name} ${athlete.last_name}`.trim(),
          metadata: { athlete_id: athlete.id, coach_id: athlete.coach_id },
        }, options);
        const { error } = await admin.from("athlete_stripe_customers").upsert({
          athlete_id: athlete.id,
          coach_id: athlete.coach_id,
          stripe_customer_id: customer.id,
        }, { onConflict: "athlete_id" });
        if (error) return { error: "Couldn't save your billing details. Please try again." };
        customerId = customer.id;
      }

      const metadata = { athlete_id: athlete.id, plan_id: plan.id, coach_id: athlete.coach_id };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        customer: customerId,
        client_reference_id: athlete.id,
        metadata,
        subscription_data: { metadata },
        success_url: `${dependencies.siteOrigin()}/athlete/membership?checkout=success`,
        cancel_url: `${dependencies.siteOrigin()}/athlete/membership`,
      }, options);
      return session.url ? { url: session.url } : { error: "Couldn't open Stripe checkout. Please try again." };
    } catch {
      return { error: "Couldn't start your membership. Please try again." };
    }
  }

  async function createBillingPortal(): Promise<ActionResult> {
    const context = await athleteContext();
    if ("error" in context) return context;
    const stripe = dependencies.getStripe();
    if (!stripe) return { error: NOT_CONFIGURED };
    const { athlete, account, admin } = context;
    if (!account) return { error: "Your coach hasn't set up payments yet." };

    try {
      const { data: membership, error: membershipError } = await admin.from("athlete_memberships")
        .select("stripe_customer_id")
        .eq("athlete_id", athlete.id)
        .in("status", [...LIVE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (membershipError || !membership) return { error: "You don't have a current membership to manage." };

      let configurationId = account.portal_configuration_id;
      const options = { stripeAccount: account.stripe_account_id };
      if (!configurationId) {
        const configuration = await stripe.billingPortal.configurations.create({
          features: {
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
            subscription_cancel: {
              enabled: true,
              mode: "at_period_end",
              proration_behavior: "none",
              cancellation_reason: { enabled: false, options: [] },
            },
          },
        }, options);
        configurationId = configuration.id;
        const { error } = await admin.from("coach_stripe_accounts")
          .update({ portal_configuration_id: configurationId })
          .eq("coach_id", athlete.coach_id)
          .is("portal_configuration_id", null);
        if (error) return { error: "Couldn't save the billing portal settings. Please try again." };
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: membership.stripe_customer_id,
        configuration: configurationId,
        return_url: `${dependencies.siteOrigin()}/athlete/membership`,
      }, options);
      return { url: session.url };
    } catch {
      return { error: "Couldn't open billing management. Please try again." };
    }
  }

  return { createCheckout, createBillingPortal };
}

export const LIVE_MEMBERSHIP_STATUSES = LIVE_STATUSES;
export const PAYMENTS_NOT_CONFIGURED = NOT_CONFIGURED;

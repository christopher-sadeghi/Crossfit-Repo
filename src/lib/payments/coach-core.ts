import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { CoachViewer, Viewer } from "@/lib/viewer";

import type { PaymentsGateway } from "./stripe";

type AdminClient = SupabaseClient<Database>;

type Dependencies = {
  getViewer: () => Promise<Viewer>;
  createAdminClient: () => AdminClient;
  getStripe: () => PaymentsGateway | null;
  siteOrigin: () => string;
};

type ActionResult = { error?: string; message?: string; url?: string };

const NOT_CONFIGURED = "Payments aren't switched on yet.";
const OWNER_ONLY = "Only the owner coach can manage payments.";

function isOwner(viewer: Viewer): viewer is CoachViewer {
  return viewer?.kind === "coach" && viewer.role === "owner";
}

export function createCoachPaymentActions(dependencies: Dependencies) {
  async function getConnectedAccount(viewer: CoachViewer, admin: AdminClient) {
    const { data, error } = await admin.from("coach_stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("coach_id", viewer.gymId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function createAccountLink(accountId: string, stripe: PaymentsGateway) {
    const origin = dependencies.siteOrigin();
    return stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/settings/payments/connect`,
      return_url: `${origin}/settings?stripe=return`,
      type: "account_onboarding",
    });
  }

  async function startConnect(): Promise<ActionResult> {
    const viewer = await dependencies.getViewer();
    if (!isOwner(viewer)) return { error: OWNER_ONLY };
    const stripe = dependencies.getStripe();
    if (!stripe) return { error: NOT_CONFIGURED };

    try {
      const admin = dependencies.createAdminClient();
      let account = await getConnectedAccount(viewer, admin);
      if (!account) {
        const created = await stripe.accounts.create({
          type: "standard",
          email: viewer.email,
          metadata: { coach_id: viewer.gymId },
        });
        const { data, error } = await admin.from("coach_stripe_accounts")
          .insert({ coach_id: viewer.gymId, stripe_account_id: created.id })
          .select("stripe_account_id, charges_enabled")
          .single();
        if (error || !data) return { error: "Couldn't save your Stripe account. Please try again." };
        account = data;
      }
      const link = await createAccountLink(account.stripe_account_id, stripe);
      return { url: link.url };
    } catch {
      return { error: "Couldn't start Stripe setup. Please try again." };
    }
  }

  async function refreshConnectLink(): Promise<ActionResult> {
    const viewer = await dependencies.getViewer();
    if (!isOwner(viewer)) return { error: OWNER_ONLY };
    const stripe = dependencies.getStripe();
    if (!stripe) return { error: NOT_CONFIGURED };

    try {
      const admin = dependencies.createAdminClient();
      const account = await getConnectedAccount(viewer, admin);
      if (!account) return {};
      const link = await createAccountLink(account.stripe_account_id, stripe);
      return { url: link.url };
    } catch {
      return { error: "Couldn't start Stripe setup. Please try again." };
    }
  }

  async function createPlan(formData: FormData): Promise<ActionResult> {
    const viewer = await dependencies.getViewer();
    if (!isOwner(viewer)) return { error: OWNER_ONLY };
    const stripe = dependencies.getStripe();
    if (!stripe) return { error: NOT_CONFIGURED };

    const name = String(formData.get("name") ?? "").trim();
    const amount = String(formData.get("amount") ?? "").trim();
    const interval = formData.get("interval");
    if (!name || name.length > 80) return { error: "Plan names must be 1–80 characters." };
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return { error: "Enter a price with no more than two decimal places." };
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < 50 || amountCents > 10_000_000) {
      return { error: "Price must be between $0.50 and $100,000.00." };
    }
    if (interval !== "month" && interval !== "year") return { error: "Choose monthly or yearly billing." };

    try {
      const admin = dependencies.createAdminClient();
      const account = await getConnectedAccount(viewer, admin);
      if (!account?.charges_enabled) return { error: "Finish setting up Stripe before adding plans." };
      const options = { stripeAccount: account.stripe_account_id };
      const product = await stripe.products.create({ name }, options);
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: amountCents,
        currency: "usd",
        recurring: { interval },
      }, options);
      const { error } = await admin.from("membership_plans").insert({
        coach_id: viewer.gymId,
        name,
        amount_cents: amountCents,
        currency: "usd",
        interval,
        stripe_product_id: product.id,
        stripe_price_id: price.id,
      });
      if (error) {
        await stripe.prices.update(price.id, { active: false }, options).catch(() => undefined);
        return { error: "Couldn't save this plan. Please try again." };
      }
      return { message: "Plan added." };
    } catch {
      return { error: "Couldn't add this plan. Please try again." };
    }
  }

  async function archivePlan(planId: string): Promise<ActionResult> {
    const viewer = await dependencies.getViewer();
    if (!isOwner(viewer)) return { error: OWNER_ONLY };
    const stripe = dependencies.getStripe();
    if (!stripe) return { error: NOT_CONFIGURED };
    if (typeof planId !== "string" || !planId.trim()) return { error: "Choose a plan to archive." };

    try {
      const admin = dependencies.createAdminClient();
      const account = await getConnectedAccount(viewer, admin);
      if (!account?.charges_enabled) return { error: "Finish setting up Stripe before managing plans." };
      const { data: plan, error: planError } = await admin.from("membership_plans")
        .select("id, stripe_price_id")
        .eq("coach_id", viewer.gymId)
        .eq("id", planId)
        .eq("active", true)
        .maybeSingle();
      if (planError || !plan) return { error: "This plan is no longer available." };

      const options = { stripeAccount: account.stripe_account_id };
      await stripe.prices.update(plan.stripe_price_id, { active: false }, options);
      const { error } = await admin.from("membership_plans").update({ active: false })
        .eq("coach_id", viewer.gymId)
        .eq("id", plan.id);
      if (error) return { error: "Couldn't archive this plan. Please try again." };
      return { message: "Plan archived. Existing subscriptions will continue." };
    } catch {
      return { error: "Couldn't archive this plan. Please try again." };
    }
  }

  return { startConnect, refreshConnectLink, createPlan, archivePlan };
}

export const PAYMENTS_NOT_CONFIGURED = NOT_CONFIGURED;

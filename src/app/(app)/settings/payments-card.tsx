import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/payments/stripe";
import { getViewer } from "@/lib/viewer";

import { ConnectStripeForm } from "./payments-connect-form";
import { PaymentsPlans } from "./payments-plans";

export async function PaymentsCard({ stripeReturn }: { stripeReturn?: string }) {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return null;

  const supabase = await createClient();
  const { data: initialAccount } = await supabase.from("coach_stripe_accounts")
    .select("stripe_account_id, charges_enabled, details_submitted")
    .eq("coach_id", viewer.gymId)
    .maybeSingle();
  let account = initialAccount;
  const stripe = getStripe();
  if (account && stripe && (stripeReturn === "return" || !account.charges_enabled)) {
    try {
      const updated = await stripe.accounts.retrieve(
        account.stripe_account_id,
        {},
        { stripeAccount: account.stripe_account_id },
      );
      account = {
        ...account,
        charges_enabled: updated.charges_enabled,
        details_submitted: updated.details_submitted,
      };
      const admin = createAdminClient();
      await admin.from("coach_stripe_accounts").update({
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
        updated_at: new Date().toISOString(),
      }).eq("coach_id", viewer.gymId);
    } catch {
      console.error("Couldn't refresh Stripe account status");
    }
  }

  const { data: plans } = viewer.role === "owner" && account?.charges_enabled
    ? await supabase.from("membership_plans")
      .select("id, name, amount_cents, interval")
      .eq("coach_id", viewer.gymId)
      .eq("active", true)
      .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Payments</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!stripe ? (
          <p className="text-sm text-muted-foreground">Payments aren&apos;t switched on yet.</p>
        ) : !account ? (
          viewer.role === "owner" ? (
            <>
              <p className="text-sm text-muted-foreground">Connect your Stripe account to offer monthly and yearly memberships.</p>
              <ConnectStripeForm label="Connect Stripe" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your coach hasn&apos;t connected Stripe yet.</p>
          )
        ) : account.charges_enabled ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Stripe connected</Badge>
              {viewer.role === "owner" && <Button asChild variant="outline" size="sm">
                <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Open Stripe dashboard</a>
              </Button>}
            </div>
            {viewer.role === "owner" && <PaymentsPlans plans={plans ?? []} />}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {account.details_submitted ? "Stripe is reviewing your account." : "Finish setting up your Stripe account to accept payments."}
            </p>
            {viewer.role === "owner" ? (
              <ConnectStripeForm label="Continue Stripe setup" />
            ) : (
              <p className="text-sm text-muted-foreground">Your coach is finishing Stripe setup.</p>
            )}
          </>
        )}
        {stripeReturn === "return" && <p className="text-sm text-muted-foreground">Stripe setup status refreshed.</p>}
      </CardContent>
    </Card>
  );
}

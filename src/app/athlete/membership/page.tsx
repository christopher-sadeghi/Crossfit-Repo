import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";
import { LIVE_MEMBERSHIP_STATUSES } from "@/lib/payments/athlete-core";

import { ManageBillingButton, MembershipActions } from "./actions";

type Props = { searchParams: Promise<{ checkout?: string }> };

function statusLabel(status: string | null) {
  switch (status) {
    case "active": return "Active";
    case "past_due":
    case "unpaid": return "Past due";
    case "canceled": return "Canceled";
    case "incomplete":
    case "incomplete_expired": return "Incomplete";
    case "trialing": return "Trial";
    case "paused": return "Paused";
    default: return "None";
  }
}

export default async function AthleteMembershipPage({ searchParams }: Props) {
  const [{ checkout }, viewer] = await Promise.all([searchParams, getViewer()]);
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  if (!getStripe()) {
    return (
      <main className="grid gap-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Membership</h1>
          <p className="mt-1 text-sm text-muted-foreground">View your membership and manage billing.</p>
        </header>
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Payments aren&apos;t switched on yet.</p></CardContent>
        </Card>
      </main>
    );
  }

  const admin = createAdminClient();
  const [liveMembershipResult, latestMembershipResult, accountResult] = await Promise.all([
    admin.from("athlete_memberships")
      .select("id, plan_id, status, current_period_end, cancel_at_period_end, created_at")
      .eq("athlete_id", viewer.athleteId)
      .in("status", [...LIVE_MEMBERSHIP_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("athlete_memberships")
      .select("id, plan_id, status, current_period_end, cancel_at_period_end, created_at")
      .eq("athlete_id", viewer.athleteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("coach_stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("coach_id", viewer.coachId)
      .maybeSingle(),
  ]);
  const membership = liveMembershipResult.data ?? latestMembershipResult.data;
  const status = membership?.status ?? null;
  const hasLiveMembership = Boolean(liveMembershipResult.data);
  const [{ data: plan }, { data: availablePlans }] = await Promise.all([
    membership?.plan_id
      ? admin.from("membership_plans").select("name, amount_cents, interval").eq("id", membership.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    !hasLiveMembership && accountResult.data?.charges_enabled
      ? admin.from("membership_plans")
        .select("id, name, amount_cents, interval")
        .eq("coach_id", viewer.coachId)
        .eq("active", true)
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const plansForDisplay = (availablePlans ?? []).map((availablePlan) => ({
    ...availablePlan,
    interval: availablePlan.interval as "month" | "year",
  }));
  const endDate = membership?.current_period_end
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(membership.current_period_end))
    : null;
  const isPastDue = status === "past_due" || status === "unpaid";

  return (
    <main className="grid gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Membership</h1>
        <p className="mt-1 text-sm text-muted-foreground">View your membership and manage billing.</p>
      </header>
      {checkout === "success" && <p role="status" className="text-sm text-muted-foreground">Checkout complete. Your membership status will update shortly.</p>}
      <Card>
        <CardHeader><CardTitle>Your membership</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isPastDue ? "destructive" : status === "active" ? "default" : "secondary"}>
              {statusLabel(status)}
            </Badge>
            {plan && <span className="font-medium">{plan.name}</span>}
          </div>
          {endDate && (
            <p className="text-sm text-muted-foreground">
              {membership?.cancel_at_period_end ? "Ends" : "Renews"} {endDate}
            </p>
          )}
          {hasLiveMembership && <ManageBillingButton />}
        </CardContent>
      </Card>
      {!hasLiveMembership && accountResult.data?.charges_enabled && availablePlans?.length ? (
        <Card>
          <CardHeader><CardTitle>Choose a membership</CardTitle></CardHeader>
          <CardContent><MembershipActions plans={plansForDisplay} /></CardContent>
        </Card>
      ) : !hasLiveMembership ? (
        <p className="text-sm text-muted-foreground">Your coach hasn&apos;t set up payments yet.</p>
      ) : null}
    </main>
  );
}

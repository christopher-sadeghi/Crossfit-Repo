"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { manageMembershipBilling, subscribeToMembership } from "../membership-actions";

type Plan = { id: string; name: string; amount_cents: number; interval: "month" | "year" };

export function MembershipActions({ plans }: { plans: Plan[] }) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function subscribe(planId: string) {
    setPendingPlan(planId);
    setError("");
    startTransition(async () => {
      const result = await subscribeToMembership(planId);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setError(result.error ?? "Couldn't start your membership. Please try again.");
      setPendingPlan(null);
    });
  }

  return (
    <div className="grid gap-3">
      {plans.map((plan) => (
        <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
          <div>
            <p className="font-medium">{plan.name}</p>
            <p className="text-sm text-muted-foreground">
              ${(plan.amount_cents / 100).toFixed(2)} / {plan.interval === "month" ? "month" : "year"}
            </p>
          </div>
          <Button type="button" disabled={pending} onClick={() => subscribe(plan.id)}>
            {pending && pendingPlan === plan.id ? "Opening…" : "Subscribe"}
          </Button>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ManageBillingButton() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid justify-items-start gap-2">
      <Button type="button" disabled={pending} onClick={() => {
        startTransition(async () => {
          const result = await manageMembershipBilling();
          if (result.url) {
            window.location.assign(result.url);
            return;
          }
          setError(result.error ?? "Couldn't open billing management. Please try again.");
        });
      }}>
        {pending ? "Opening…" : "Manage billing"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

"use server";

import { createAthletePaymentActions } from "@/lib/payments/athlete-core";
import { getStripe } from "@/lib/payments/stripe";
import { siteOrigin } from "@/lib/email/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

function actions() {
  return createAthletePaymentActions({ getViewer, createAdminClient, getStripe, siteOrigin });
}

export async function subscribeToMembership(planId: string) {
  return actions().createCheckout(planId);
}

export async function manageMembershipBilling() {
  return actions().createBillingPortal();
}

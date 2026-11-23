"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/payments/stripe";
import { createCoachPaymentActions } from "@/lib/payments/coach-core";
import { siteOrigin } from "@/lib/email/origin";
import { getViewer } from "@/lib/viewer";

function actions() {
  return createCoachPaymentActions({ getViewer, createAdminClient, getStripe, siteOrigin });
}

export async function startStripeConnect(state: { error?: string } | undefined, formData: FormData) {
  void state;
  void formData;
  const result = await actions().startConnect();
  if (result.error || !result.url) return result;
  redirect(result.url);
}

export async function createMembershipPlan(state: { error?: string; message?: string } | undefined, formData: FormData) {
  void state;
  const result = await actions().createPlan(formData);
  if (!result.error) {
    revalidatePath("/settings");
    revalidatePath("/athlete/membership");
  }
  return result;
}

export async function archiveMembershipPlan(planId: string) {
  const result = await actions().archivePlan(planId);
  if (!result.error) {
    revalidatePath("/settings");
    revalidatePath("/athlete/membership");
  }
  return result;
}

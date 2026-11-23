import "server-only";

import Stripe from "stripe";

export type PaymentsGateway = {
  accounts: Pick<Stripe["accounts"], "create" | "retrieve">;
  accountLinks: Pick<Stripe["accountLinks"], "create">;
  products: Pick<Stripe["products"], "create">;
  prices: Pick<Stripe["prices"], "create" | "update">;
  customers: Pick<Stripe["customers"], "create">;
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "create" | "list" | "expire"> };
  billingPortal: {
    configurations: Pick<Stripe["billingPortal"]["configurations"], "create">;
    sessions: Pick<Stripe["billingPortal"]["sessions"], "create">;
  };
  subscriptions: Pick<Stripe["subscriptions"], "retrieve">;
  webhooks: Pick<Stripe["webhooks"], "constructEvent">;
};

export function getStripe(): PaymentsGateway | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}

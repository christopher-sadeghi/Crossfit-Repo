import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import Stripe from "stripe";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const ownerId = "81000000-0000-4000-8000-000000000001";
const staffId = "81000000-0000-4000-8000-000000000002";
const otherOwnerId = "81000000-0000-4000-8000-000000000003";
const athleteId = "81000000-0000-4000-8000-000000000011";
const otherAthleteId = "81000000-0000-4000-8000-000000000012";
const planId = "81000000-0000-4000-8000-000000000021";
const otherPlanId = "81000000-0000-4000-8000-000000000022";
const accountId = "acct_test_connected";
const signingSecret = "whsec_test_offline";

function loader(mocks = {}) {
  const cache = new Map();
  return function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const localRequire = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/") ? path.join(root, `src/${id.slice(2)}`) : path.resolve(path.dirname(filename), id);
        const target = existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
        return load(path.relative(root, target));
      }
      return require(id);
    };
    new Function("require", "module", "exports", source)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  };
}

function fakeAdmin(tables = {}) {
  const calls = [];
  for (const table of ["coach_stripe_accounts", "membership_plans", "athlete_stripe_customers", "athlete_memberships", "stripe_webhook_events", "athletes", "notifications"]) {
    tables[table] ??= [];
  }
  const client = {
    from(table) {
      const filters = [];
      let operation = "select";
      let payload;
      let options;
      let limit = Infinity;
      let ordering;
      let selected = false;
      const query = {
        select() { selected = true; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        is(key, value) { filters.push((row) => row[key] === value); return query; },
        order(key, { ascending = true } = {}) { ordering = [key, ascending]; return query; },
        limit(value) { limit = value; return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        upsert(value, valueOptions = {}) { operation = "upsert"; payload = value; options = valueOptions; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        delete() { operation = "delete"; return query; },
        async maybeSingle() {
          const result = resolve();
          return { ...result, data: result.data?.[0] ?? null };
        },
        async single() {
          const result = resolve();
          return { ...result, data: result.data?.[0] ?? null };
        },
        then(resolvePromise, rejectPromise) {
          return Promise.resolve().then(resolve).then(resolvePromise, rejectPromise);
        },
      };
      function resolve() {
        const rows = tables[table];
        let matching = rows.filter((row) => filters.every((filter) => filter(row)));
        if (ordering) {
          const [key, ascending] = ordering;
          matching = [...matching].sort((a, b) => {
            const result = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
            return ascending ? result : -result;
          });
        }
        matching = matching.slice(0, limit);
        let data = matching;
        if (operation === "insert" || operation === "upsert") {
          const incoming = Array.isArray(payload) ? payload : [payload];
          data = [];
          for (const item of incoming) {
            const key = options?.onConflict?.split(",")[0] ?? "id";
            const existing = operation === "upsert" ? rows.find((row) => row[key] === item[key]) : null;
            if (existing && options?.ignoreDuplicates) continue;
            if (existing) Object.assign(existing, item);
            else {
              const inserted = { created_at: "2026-11-21T00:00:00.000Z", ...item };
              rows.push(inserted);
              data.push(inserted);
            }
          }
          calls.push([operation, table, payload, options]);
        } else if (operation === "update") {
          for (const row of matching) Object.assign(row, payload);
          data = matching;
          calls.push([operation, table, payload, filters]);
        } else if (operation === "delete") {
          const removed = new Set(matching);
          tables[table] = rows.filter((row) => !removed.has(row));
          data = matching;
          calls.push([operation, table, filters]);
        }
        return { data: selected || operation === "select" ? data : null, error: null };
      }
      return query;
    },
  };
  return { client, tables, calls };
}

function fakeGateway() {
  const calls = [];
  const subscriptions = new Map();
  const gateway = {
    accounts: {
      create: async (...args) => { calls.push(["accounts.create", ...args]); return { id: accountId }; },
      retrieve: async (...args) => { calls.push(["accounts.retrieve", ...args]); return { id: accountId, charges_enabled: true, details_submitted: true }; },
    },
    accountLinks: {
      create: async (...args) => { calls.push(["accountLinks.create", ...args]); return { url: "https://connect.stripe.test/onboarding" }; },
    },
    products: {
      create: async (...args) => { calls.push(["products.create", ...args]); return { id: "prod_created" }; },
    },
    prices: {
      create: async (...args) => { calls.push(["prices.create", ...args]); return { id: "price_created" }; },
      update: async (...args) => { calls.push(["prices.update", ...args]); return { id: args[0], active: false }; },
    },
    customers: {
      create: async (...args) => { calls.push(["customers.create", ...args]); return { id: "cus_created" }; },
    },
    checkout: {
      sessions: {
        list: async (...args) => { calls.push(["checkout.sessions.list", ...args]); return { data: [] }; },
        expire: async (...args) => { calls.push(["checkout.sessions.expire", ...args]); return { id: args[0] }; },
        create: async (...args) => { calls.push(["checkout.sessions.create", ...args]); return { id: "cs_created", url: "https://checkout.stripe.test/session" }; },
      },
    },
    billingPortal: {
      configurations: {
        create: async (...args) => { calls.push(["billingPortal.configurations.create", ...args]); return { id: "bpc_created" }; },
      },
      sessions: {
        create: async (...args) => { calls.push(["billingPortal.sessions.create", ...args]); return { url: "https://billing.stripe.test/session" }; },
      },
    },
    subscriptions: {
      retrieve: async (...args) => {
        calls.push(["subscriptions.retrieve", ...args]);
        return subscriptions.get(args[0]);
      },
    },
  };
  return { gateway, calls, subscriptions };
}

function ownerViewer(role = "owner") {
  return { kind: "coach", id: role === "owner" ? ownerId : staffId, gymId: ownerId, role, email: "owner@example.test" };
}

function athleteViewer(id = athleteId, coachId = ownerId) {
  return { kind: "athlete", athleteId: id, coachId, firstName: "Alex", units: "lb" };
}

function plan(id = planId, coachId = ownerId, active = true) {
  return { id, coach_id: coachId, name: "Monthly", amount_cents: 5000, currency: "usd", interval: "month", stripe_product_id: "prod_test", stripe_price_id: `price_${id}`, active };
}

function athlete(id = athleteId, coachId = ownerId, overrides = {}) {
  return { id, coach_id: coachId, first_name: "Alex", last_name: "Athlete", email: "alex@example.test", user_id: `${id}-user`, status: "active", assigned_coach_id: null, ...overrides };
}

function coachActionsFixture({ viewer = ownerViewer(), configured = true, tables = {} } = {}) {
  const admin = fakeAdmin(tables);
  const stripe = fakeGateway();
  const { createCoachPaymentActions } = loader()("src/lib/payments/coach-core.ts");
  return {
    ...admin,
    ...stripe,
    actions: createCoachPaymentActions({
      getViewer: async () => viewer,
      createAdminClient: () => admin.client,
      getStripe: () => configured ? stripe.gateway : null,
      siteOrigin: () => "https://fitcoach.example.test",
    }),
  };
}

function athleteActionsFixture({ viewer = athleteViewer(), configured = true, tables = {} } = {}) {
  const admin = fakeAdmin(tables);
  const stripe = fakeGateway();
  const { createAthletePaymentActions } = loader()("src/lib/payments/athlete-core.ts");
  return {
    ...admin,
    ...stripe,
    actions: createAthletePaymentActions({
      getViewer: async () => viewer,
      createAdminClient: () => admin.client,
      getStripe: () => configured ? stripe.gateway : null,
      siteOrigin: () => "https://fitcoach.example.test",
    }),
  };
}

function demoResetFixture({ membership = null } = {}) {
  const state = { reset: null, table: null, coachId: null, statuses: null };
  const query = {
    select() { return query; },
    eq(column, value) {
      if (column === "coach_id") state.coachId = value;
      return query;
    },
    in(column, values) {
      if (column === "status") state.statuses = values;
      return query;
    },
    limit() { return query; },
    async maybeSingle() { return { data: membership ? { id: "membership" } : null, error: null }; },
  };
  const supabase = {
    from(table) {
      state.table = table;
      return query;
    },
  };
  const { loadDemoData } = loader({
    "next/cache": { revalidatePath() {} },
    "@/lib/reset-demo-data.mjs": {
      async loadDemoDataWithClipCleanup(_supabase, reset) {
        state.reset = reset;
        return { data: { athletes: 12, workouts: 20, results: 30 }, error: null, clipError: null };
      },
    },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/viewer": { getViewer: async () => ownerViewer() },
  })("src/app/(app)/settings/demo-actions.ts");
  return { loadDemoData, state };
}

test("Stripe payments require both non-empty server secrets", () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const { getStripe } = loader({ "server-only": {} })("src/lib/payments/stripe.ts");
  try {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(getStripe(), null);

    process.env.STRIPE_SECRET_KEY = "sk_test_fitcoach_offline";
    assert.equal(getStripe(), null);

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_offline";
    assert.ok(getStripe());

    process.env.STRIPE_WEBHOOK_SECRET = "  ";
    assert.equal(getStripe(), null);

    process.env.STRIPE_SECRET_KEY = "  ";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_offline";
    assert.equal(getStripe(), null);
  } finally {
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
    if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  }
});

test("only the owner can connect or create plans, and missing Stripe configuration is reported", async () => {
  const staff = coachActionsFixture({ viewer: ownerViewer("coach") });
  assert.match((await staff.actions.startConnect()).error, /owner coach/i);
  assert.match((await staff.actions.refreshConnectLink()).error, /owner coach/i);
  assert.match((await staff.actions.createPlan(new FormData())).error, /owner coach/i);
  assert.equal(staff.calls.length, 0);

  const unconfigured = coachActionsFixture({ configured: false });
  assert.equal((await unconfigured.actions.startConnect()).error, "Payments aren't switched on yet.");
  assert.equal((await unconfigured.actions.refreshConnectLink()).error, "Payments aren't switched on yet.");
  assert.equal((await unconfigured.actions.createPlan(new FormData())).error, "Payments aren't switched on yet.");
  assert.equal(unconfigured.calls.length, 0);

  const owner = coachActionsFixture();
  const result = await owner.actions.startConnect();
  assert.equal(result.url, "https://connect.stripe.test/onboarding");
  assert.deepEqual(owner.calls.find(([name]) => name === "accounts.create").slice(1), [{
    type: "standard", email: "owner@example.test", metadata: { coach_id: ownerId },
  }]);
  assert.equal(owner.tables.coach_stripe_accounts[0].coach_id, ownerId);
  assert.equal(owner.calls.find(([name]) => name === "accountLinks.create")[2], undefined);
});

test("Connect refresh links never create a Stripe account", async () => {
  const noAccount = coachActionsFixture();
  assert.deepEqual(await noAccount.actions.refreshConnectLink(), {});
  assert.deepEqual(noAccount.calls, []);

  const existingAccount = coachActionsFixture({
    tables: { coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: false }] },
  });
  assert.deepEqual(await existingAccount.actions.refreshConnectLink(), { url: "https://connect.stripe.test/onboarding" });
  assert.equal(existingAccount.calls.some(([name]) => name === "accounts.create"), false);
  assert.equal(existingAccount.calls.some(([name]) => name === "accountLinks.create"), true);
});

test("demo reset is blocked while any gym athlete has a live membership", async () => {
  const fixture = demoResetFixture({ membership: { id: "membership" } });
  const formData = new FormData();
  formData.set("mode", "reset");
  assert.deepEqual(await fixture.loadDemoData({}, formData), {
    error: "Some athletes have active memberships. Cancel them in your Stripe dashboard before resetting demo data.",
  });
  assert.equal(fixture.state.table, "athlete_memberships");
  assert.equal(fixture.state.coachId, ownerId);
  assert.deepEqual(fixture.state.statuses, ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]);
  assert.equal(fixture.state.reset, null);

  const safe = demoResetFixture();
  assert.deepEqual(await safe.loadDemoData({}, formData), {
    message: "Loaded 12 athletes, 20 workouts and 30 results.",
  });
  assert.equal(safe.state.reset, true);
});

test("plan validation is strict and valid plan creation uses the connected account", async () => {
  const fixture = coachActionsFixture({
    tables: { coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: true }] },
  });
  for (const [amount, interval] of [["0.49", "month"], ["10.001", "month"], ["100000.01", "month"], ["12", "week"]]) {
    const form = new FormData();
    form.set("name", "Plan");
    form.set("amount", amount);
    form.set("interval", interval);
    assert.ok((await fixture.actions.createPlan(form)).error);
  }
  assert.equal(fixture.calls.length, 0);

  const form = new FormData();
  form.set("name", "  Strength  ");
  form.set("amount", "49.99");
  form.set("interval", "year");
  assert.deepEqual(await fixture.actions.createPlan(form), { message: "Plan added." });
  assert.deepEqual(fixture.calls.find(([name]) => name === "products.create").slice(1), [
    { name: "Strength" }, { stripeAccount: accountId },
  ]);
  assert.deepEqual(fixture.calls.find(([name]) => name === "prices.create").slice(1), [
    { product: "prod_created", unit_amount: 4999, currency: "usd", recurring: { interval: "year" } },
    { stripeAccount: accountId },
  ]);
  assert.equal(fixture.tables.membership_plans[0].amount_cents, 4999);
});

test("checkout creates a connected-account subscription session with metadata", async () => {
  const fixture = athleteActionsFixture({
    tables: {
      athletes: [athlete()],
      coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: true }],
      membership_plans: [plan()],
    },
  });
  fixture.gateway.checkout.sessions.list = async (...args) => {
    fixture.calls.push(["checkout.sessions.list", ...args]);
    return { data: [{ id: "cs_open" }] };
  };
  const result = await fixture.actions.createCheckout(planId);
  assert.equal(result.url, "https://checkout.stripe.test/session");
  const listCall = fixture.calls.find(([name]) => name === "checkout.sessions.list");
  assert.deepEqual(listCall.slice(1), [
    { customer: "cus_created", status: "open", limit: 100 },
    { stripeAccount: accountId },
  ]);
  const expireCall = fixture.calls.find(([name]) => name === "checkout.sessions.expire");
  assert.deepEqual(expireCall.slice(1), ["cs_open", {}, { stripeAccount: accountId }]);
  assert.ok(fixture.calls.indexOf(expireCall) < fixture.calls.findIndex(([name]) => name === "checkout.sessions.create"));
  const checkout = fixture.calls.find(([name]) => name === "checkout.sessions.create");
  assert.deepEqual(checkout[1].line_items, [{ price: `price_${planId}`, quantity: 1 }]);
  assert.equal(checkout[1].mode, "subscription");
  assert.deepEqual(checkout[1].metadata, { athlete_id: athleteId, plan_id: planId, coach_id: ownerId });
  assert.deepEqual(checkout[1].subscription_data.metadata, checkout[1].metadata);
  assert.equal(checkout[1].client_reference_id, athleteId);
  assert.deepEqual(checkout[2], { stripeAccount: accountId });
  assert.equal(fixture.tables.athlete_stripe_customers[0].stripe_customer_id, "cus_created");
  assert.deepEqual(fixture.calls.find(([name]) => name === "customers.create")[2], { stripeAccount: accountId });
});

test("checkout rejects live memberships, archived or foreign plans, disabled accounts, and inactive athletes", async () => {
  const base = {
    athletes: [athlete()],
    coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: true }],
    membership_plans: [plan(), plan(otherPlanId, otherOwnerId)],
  };
  const live = athleteActionsFixture({ tables: { ...base, athlete_memberships: [{ athlete_id: athleteId, status: "past_due" }] } });
  assert.match((await live.actions.createCheckout(planId)).error, /current membership/i);
  assert.equal(live.calls.some(([name]) => name === "checkout.sessions.create"), false);

  const archived = athleteActionsFixture({ tables: { ...base, membership_plans: [plan(planId, ownerId, false)] } });
  assert.ok((await archived.actions.createCheckout(planId)).error);
  const foreign = athleteActionsFixture({ tables: base });
  assert.ok((await foreign.actions.createCheckout(otherPlanId)).error);

  const disabled = athleteActionsFixture({
    tables: { ...base, coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: false }] },
  });
  assert.match((await disabled.actions.createCheckout(planId)).error, /hasn't set up payments/i);

  const inactive = athleteActionsFixture({ tables: { ...base, athletes: [athlete(athleteId, ownerId, { status: "archived" })] } });
  assert.match((await inactive.actions.createCheckout(planId)).error, /isn't active/i);
});

test("billing portal configuration is created once and reused for live memberships", async () => {
  const fixture = athleteActionsFixture({
    tables: {
      athletes: [athlete()],
      coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: true, portal_configuration_id: null }],
      athlete_memberships: [{ athlete_id: athleteId, coach_id: ownerId, stripe_customer_id: "cus_existing", status: "active", created_at: "2026-11-21" }],
    },
  });
  assert.equal((await fixture.actions.createBillingPortal()).url, "https://billing.stripe.test/session");
  assert.equal((await fixture.actions.createBillingPortal()).url, "https://billing.stripe.test/session");
  assert.equal(fixture.calls.filter(([name]) => name === "billingPortal.configurations.create").length, 1);
  const configCall = fixture.calls.find(([name]) => name === "billingPortal.configurations.create");
  assert.equal(configCall[1].features.subscription_cancel.mode, "at_period_end");
  assert.deepEqual(configCall[2], { stripeAccount: accountId });
  assert.equal(fixture.calls.filter(([name]) => name === "billingPortal.sessions.create").length, 2);
});

test("archived athletes can manage billing but cannot start checkout", async () => {
  const fixture = athleteActionsFixture({
    tables: {
      athletes: [athlete(athleteId, ownerId, { status: "archived" })],
      coach_stripe_accounts: [{
        coach_id: ownerId,
        stripe_account_id: accountId,
        charges_enabled: true,
        portal_configuration_id: "bpc_existing",
      }],
      athlete_memberships: [{
        athlete_id: athleteId,
        coach_id: ownerId,
        stripe_customer_id: "cus_existing",
        status: "active",
        created_at: "2026-11-21",
      }],
      membership_plans: [plan()],
    },
  });
  assert.equal((await fixture.actions.createBillingPortal()).url, "https://billing.stripe.test/session");
  assert.match((await fixture.actions.createCheckout(planId)).error, /isn't active/i);
  assert.equal(fixture.calls.some(([name]) => name === "checkout.sessions.create"), false);
});

function stripeEvent(type, object, id, account = accountId) {
  return {
    id,
    object: "event",
    api_version: "2026-10-01",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    account,
  };
}

function webhookRouteFixture({ tables = {}, configured = true } = {}) {
  process.env.STRIPE_WEBHOOK_SECRET = signingSecret;
  const admin = fakeAdmin(tables);
  const stripeClient = new Stripe("sk_test_fitcoach_offline");
  const fake = fakeGateway();
  const gateway = { ...fake.gateway, webhooks: stripeClient.webhooks };
  const { POST } = loader({
    "next/server": {
      NextResponse: {
        json(body, options = {}) {
          return new Response(JSON.stringify(body), { status: options.status ?? 200, headers: { "content-type": "application/json" } });
        },
      },
    },
    "@/lib/email/notifications": { emailNewNotifications: async (...args) => { fake.calls.push(["email", ...args]); } },
    "@/lib/push/send": { pushNewNotifications: async (...args) => { fake.calls.push(["push", ...args]); } },
    "@/lib/payments/stripe": { getStripe: () => configured ? gateway : null },
    "@/lib/supabase/admin": { createAdminClient: () => admin.client },
  })("src/app/api/stripe/webhook/route.ts");
  async function send(event, signatureOverride) {
    const payload = JSON.stringify(event);
    const signature = signatureOverride ?? stripeClient.webhooks.generateTestHeaderString({
      payload,
      secret: signingSecret,
      timestamp: Math.floor(Date.now() / 1000),
    });
    return POST(new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }));
  }
  return { ...admin, ...fake, stripeClient, send, event: stripeEvent };
}

test("webhook signature failures return 400 and unknown Connect accounts are ignored", async () => {
  const fixture = webhookRouteFixture({ tables: { coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }] } });
  const event = stripeEvent("account.updated", { id: accountId, charges_enabled: true, details_submitted: true }, "evt_bad");
  assert.equal((await fixture.send(event, "bad-signature")).status, 400);
  assert.equal((await fixture.send(stripeEvent("account.updated", {}, "evt_unknown", "acct_unknown"))).status, 200);
  assert.equal(fixture.tables.stripe_webhook_events.length, 0);
});

test("account.updated refreshes connected account capabilities", async () => {
  const fixture = webhookRouteFixture({
    tables: { coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId, charges_enabled: false, details_submitted: false }] },
  });
  assert.equal((await fixture.send(stripeEvent("account.updated", {
    id: accountId, charges_enabled: true, details_submitted: true,
  }, "evt_account_updated"))).status, 200);
  assert.equal(fixture.tables.coach_stripe_accounts[0].charges_enabled, true);
  assert.equal(fixture.tables.coach_stripe_accounts[0].details_submitted, true);
});

test("checkout and subscription lifecycle upsert membership on the connected account", async () => {
  const subscription = {
    id: "sub_lifecycle",
    status: "active",
    customer: "cus_lifecycle",
    metadata: { athlete_id: athleteId, plan_id: planId, coach_id: ownerId },
    current_period_end: 1800000000,
    cancel_at_period_end: false,
    items: { data: [{ price: { id: `price_${planId}` }, current_period_end: 1800000000 }] },
  };
  const fixture = webhookRouteFixture({
    tables: {
      coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }],
      athletes: [athlete()],
      membership_plans: [plan()],
    },
  });
  fixture.subscriptions.set(subscription.id, subscription);
  const completed = stripeEvent("checkout.session.completed", {
    mode: "subscription", subscription: subscription.id, metadata: { athlete_id: athleteId, plan_id: planId, coach_id: ownerId },
  }, "evt_checkout");
  assert.equal((await fixture.send(completed)).status, 200);
  assert.equal(fixture.tables.athlete_memberships[0].status, "active");
  assert.equal(fixture.calls.find(([name]) => name === "subscriptions.retrieve")[3].stripeAccount, accountId);

  const updated = { ...subscription, status: "past_due" };
  fixture.subscriptions.set(subscription.id, updated);
  assert.equal((await fixture.send(stripeEvent("customer.subscription.updated", updated, "evt_update"))).status, 200);
  assert.equal(fixture.tables.athlete_memberships[0].status, "past_due");
  const deleted = { ...updated, status: "canceled" };
  fixture.subscriptions.set(subscription.id, deleted);
  assert.equal((await fixture.send(stripeEvent("customer.subscription.deleted", deleted, "evt_delete"))).status, 200);
  assert.equal(fixture.tables.athlete_memberships[0].status, "canceled");
});

test("subscription lifecycle events use the retrieved state instead of an out-of-order payload", async () => {
  const subscription = {
    id: "sub_out_of_order",
    status: "canceled",
    customer: "cus_out_of_order",
    metadata: { athlete_id: athleteId, plan_id: planId, coach_id: ownerId },
    cancel_at_period_end: false,
    items: { data: [{ price: { id: `price_${planId}` } }] },
  };
  const fixture = webhookRouteFixture({
    tables: {
      coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }],
      athletes: [athlete()],
      membership_plans: [plan()],
    },
  });
  fixture.subscriptions.set(subscription.id, subscription);
  assert.equal((await fixture.send(stripeEvent("customer.subscription.updated", {
    ...subscription,
    status: "active",
  }, "evt_late_active"))).status, 200);
  assert.equal(fixture.tables.athlete_memberships[0].status, "canceled");
  const retrieveCall = fixture.calls.find(([name]) => name === "subscriptions.retrieve");
  assert.deepEqual(retrieveCall.slice(1), [subscription.id, {}, { stripeAccount: accountId }]);
});

test("payment failures notify the assigned coach and athlete, falling back to the owner", async () => {
  for (const [assigned, coachRecipient] of [[staffId, staffId], [null, ownerId]]) {
    const id = assigned ? athleteId : otherAthleteId;
    const coachAthlete = athlete(id, ownerId, { assigned_coach_id: assigned });
    const fixture = webhookRouteFixture({
      tables: {
        coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }],
        athletes: [coachAthlete],
        athlete_memberships: [{ athlete_id: id, coach_id: ownerId, stripe_subscription_id: `sub_${id}`, status: "active" }],
      },
    });
    fixture.subscriptions.set(`sub_${id}`, {
      id: `sub_${id}`,
      status: "past_due",
      customer: `cus_${id}`,
      metadata: { athlete_id: id, coach_id: ownerId },
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_missing" } }] },
    });
    const event = stripeEvent("invoice.payment_failed", {
      id: `in_${id}`,
      parent: { subscription_details: { subscription: `sub_${id}` } },
    }, `evt_invoice_${id}`);
    assert.equal((await fixture.send(event)).status, 200);
    assert.equal(fixture.tables.athlete_memberships[0].status, "past_due");
    assert.deepEqual(fixture.tables.notifications.map((row) => row.recipient_id).sort(), [coachRecipient, `${id}-user`].sort());
    const coachNotice = fixture.tables.notifications.find((row) => row.recipient_id === coachRecipient);
    const athleteNotice = fixture.tables.notifications.find((row) => row.recipient_id === `${id}-user`);
    assert.equal(coachNotice.title, "Payment failed for Alex Athlete");
    assert.equal(coachNotice.link, `/athletes/${id}`);
    assert.equal(athleteNotice.body, "Your payment failed — update your card.");
    assert.equal(athleteNotice.link, "/athlete/membership");
    assert.ok(fixture.calls.some(([name]) => name === "push"));
    assert.ok(fixture.calls.some(([name]) => name === "email"));
  }
});

test("payment failure notifications are skipped when the retrieved subscription has recovered", async () => {
  const subscription = {
    id: "sub_recovered",
    status: "active",
    customer: "cus_recovered",
    metadata: { athlete_id: athleteId, coach_id: ownerId },
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_missing" } }] },
  };
  const fixture = webhookRouteFixture({
    tables: {
      coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }],
      athletes: [athlete()],
      athlete_memberships: [{
        athlete_id: athleteId,
        coach_id: ownerId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        status: "past_due",
      }],
    },
  });
  fixture.subscriptions.set(subscription.id, subscription);
  assert.equal((await fixture.send(stripeEvent("invoice.payment_failed", {
    id: "in_recovered",
    subscription: subscription.id,
  }, "evt_recovered"))).status, 200);
  assert.equal(fixture.tables.athlete_memberships[0].status, "active");
  assert.equal(fixture.tables.notifications.length, 0);
  assert.equal(fixture.calls.some(([name]) => name === "push" || name === "email"), false);
});

test("duplicate event ids are a no-op and subscriptions for another coach's athlete are ignored", async () => {
  const subscription = {
    id: "sub_other",
    status: "active",
    customer: "cus_other",
    metadata: { athlete_id: otherAthleteId, plan_id: otherPlanId, coach_id: ownerId },
    cancel_at_period_end: false,
    items: { data: [{ price: { id: `price_${otherPlanId}` } }] },
  };
  const fixture = webhookRouteFixture({
    tables: {
      coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }],
      athletes: [athlete(otherAthleteId, otherOwnerId)],
      membership_plans: [plan(otherPlanId, otherOwnerId)],
    },
  });
  fixture.subscriptions.set(subscription.id, subscription);
  const changed = stripeEvent("customer.subscription.created", subscription, "evt_duplicate");
  assert.equal((await fixture.send(changed)).status, 200);
  assert.equal((await fixture.send(changed)).status, 200);
  assert.equal(fixture.tables.athlete_memberships.length, 0);
  assert.equal(fixture.tables.stripe_webhook_events.length, 1);
});

test("processing failures remove the idempotency event so Stripe can retry", async () => {
  const fixture = webhookRouteFixture({
    tables: { coach_stripe_accounts: [{ coach_id: ownerId, stripe_account_id: accountId }] },
  });
  fixture.gateway.subscriptions.retrieve = async () => { throw new Error("offline"); };
  const event = stripeEvent("checkout.session.completed", {
    mode: "subscription", subscription: "sub_retry", metadata: { athlete_id: athleteId, plan_id: planId, coach_id: ownerId },
  }, "evt_retry");
  assert.equal((await fixture.send(event)).status, 500);
  assert.equal(fixture.tables.stripe_webhook_events.length, 0);
});

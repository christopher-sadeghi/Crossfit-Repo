begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('56000000-0000-0000-0000-000000000001', 'payments-owner-a@test.local', '{"full_name":"Owner A"}'),
  ('56000000-0000-0000-0000-000000000002', 'payments-staff-a@test.local', '{"full_name":"Staff A"}'),
  ('56000000-0000-0000-0000-000000000003', 'payments-owner-b@test.local', '{"full_name":"Owner B"}'),
  ('56000000-0000-0000-0000-000000000004', 'payments-athlete-a@test.local', '{}'),
  ('56000000-0000-0000-0000-000000000005', 'payments-athlete-b@test.local', '{}');

update public.coaches
set gym_id = '56000000-0000-0000-0000-000000000001'
where id = '56000000-0000-0000-0000-000000000002';

insert into public.athletes(id, coach_id, user_id, first_name, last_name)
values
  ('56000000-0000-0000-0000-000000000011', '56000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000004', 'Athlete', 'A'),
  ('56000000-0000-0000-0000-000000000012', '56000000-0000-0000-0000-000000000003', '56000000-0000-0000-0000-000000000005', 'Athlete', 'B');

insert into public.coach_stripe_accounts(coach_id, stripe_account_id, charges_enabled, details_submitted)
values
  ('56000000-0000-0000-0000-000000000001', 'acct_payments_a', true, true),
  ('56000000-0000-0000-0000-000000000003', 'acct_payments_b', true, true);

insert into public.membership_plans(id, coach_id, name, amount_cents, interval, stripe_product_id, stripe_price_id, active)
values
  ('56000000-0000-0000-0000-000000000021', '56000000-0000-0000-0000-000000000001', 'Monthly', 5000, 'month', 'prod_a_month', 'price_a_month', true),
  ('56000000-0000-0000-0000-000000000022', '56000000-0000-0000-0000-000000000001', 'Archived', 7000, 'month', 'prod_a_old', 'price_a_old', false),
  ('56000000-0000-0000-0000-000000000023', '56000000-0000-0000-0000-000000000003', 'Yearly', 50000, 'year', 'prod_b_year', 'price_b_year', true);

insert into public.athlete_stripe_customers(athlete_id, coach_id, stripe_customer_id)
values
  ('56000000-0000-0000-0000-000000000011', '56000000-0000-0000-0000-000000000001', 'cus_payments_a'),
  ('56000000-0000-0000-0000-000000000012', '56000000-0000-0000-0000-000000000003', 'cus_payments_b');

insert into public.athlete_memberships(athlete_id, coach_id, plan_id, stripe_subscription_id, stripe_customer_id, status)
values
  ('56000000-0000-0000-0000-000000000011', '56000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000021', 'sub_payments_a', 'cus_payments_a', 'active'),
  ('56000000-0000-0000-0000-000000000012', '56000000-0000-0000-0000-000000000003', '56000000-0000-0000-0000-000000000023', 'sub_payments_b', 'cus_payments_b', 'past_due');

insert into public.stripe_webhook_events(id) values ('evt_payments_test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"56000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ declare t text; begin
  assert (select count(*) = 1 from public.coach_stripe_accounts);
  assert (select count(*) = 2 from public.membership_plans);
  assert (select count(*) = 1 from public.athlete_memberships);
  assert not exists (select 1 from public.athlete_stripe_customers);
  assert not exists (select 1 from public.stripe_webhook_events);
  foreach t in array array[
    'coach_stripe_accounts', 'membership_plans', 'athlete_stripe_customers',
    'athlete_memberships', 'stripe_webhook_events'
  ] loop
    assert has_table_privilege('authenticated', format('public.%I', t), 'select');
    assert not has_table_privilege('authenticated', format('public.%I', t), 'insert');
    assert not has_table_privilege('authenticated', format('public.%I', t), 'update');
    assert not has_table_privilege('authenticated', format('public.%I', t), 'delete');
  end loop;
end $$;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) = 1 from public.coach_stripe_accounts);
  assert (select count(*) = 2 from public.membership_plans);
  assert (select count(*) = 1 from public.athlete_memberships);
end $$;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) = 1 from public.coach_stripe_accounts);
  assert (select count(*) = 1 from public.membership_plans);
  assert (select count(*) = 1 from public.athlete_memberships);
  assert not exists (select 1 from public.membership_plans where id = '56000000-0000-0000-0000-000000000021');
end $$;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) = 1 from public.membership_plans);
  assert not exists (select 1 from public.membership_plans where active = false);
  assert (select count(*) = 1 from public.athlete_memberships);
  assert not exists (select 1 from public.coach_stripe_accounts);
  assert not exists (select 1 from public.athlete_stripe_customers);
  assert not exists (select 1 from public.stripe_webhook_events);
end $$;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) = 1 from public.membership_plans);
  assert (select count(*) = 1 from public.athlete_memberships);
end $$;

reset role;
insert into public.notifications(recipient_id, athlete_id, kind, title, body, link)
values ('56000000-0000-0000-0000-000000000004', '56000000-0000-0000-0000-000000000011',
  'payment_failed', 'Your payment failed', 'Update your card.', '/athlete/membership');
do $$ begin
  assert (select count(*) = 1 from public.notifications where kind = 'payment_failed');
end $$;

rollback;

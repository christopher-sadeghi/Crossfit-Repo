-- Run against a migrated local database only.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('36000000-0000-0000-0000-000000000001', 'push-a@test.local', '{}'),
 ('36000000-0000-0000-0000-000000000002', 'push-b@test.local', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"36000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.register_push_subscription('https://push.test/device', 'key-a', 'auth-a', 'test');
select set_config('request.jwt.claims', '{"sub":"36000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ declare n integer; begin
  assert (select count(*) from public.push_subscriptions) = 0, 'cannot see another user';
  update public.push_subscriptions set auth = 'forged';
  get diagnostics n = row_count;
  assert n = 0, 'cannot update another user';
  delete from public.push_subscriptions;
  get diagnostics n = row_count;
  assert n = 0, 'cannot delete another user';
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('36000000-0000-0000-0000-000000000001', 'https://push.test/forged', 'key', 'auth');
    raise exception 'forged owner allowed';
  exception when insufficient_privilege then null; end;
end $$;
select public.register_push_subscription('https://push.test/device', 'key-b', 'auth-b', 'test');
do $$ begin
  assert (select count(*) from public.push_subscriptions) = 1, 'RPC reassigns device';
  assert (select p256dh from public.push_subscriptions) = 'key-b', 'RPC updates keys';
  update public.push_subscriptions set user_agent = 'updated';
  assert (select user_agent from public.push_subscriptions) = 'updated', 'can update own row';
  begin
    update public.push_subscriptions set p256dh = repeat('k', 501);
    raise exception 'oversized p256dh allowed';
  exception when check_violation then null; end;
  begin
    update public.push_subscriptions set auth = repeat('a', 501);
    raise exception 'oversized auth allowed';
  exception when check_violation then null; end;
  update public.push_subscriptions set p256dh = repeat('k', 500), auth = repeat('a', 500);
  begin
    update public.push_subscriptions set user_id = '36000000-0000-0000-0000-000000000001';
    raise exception 'owner change allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"36000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.push_subscriptions) = 0, 'previous owner loses access';
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform * from public.push_subscriptions; raise exception 'anon read allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.register_push_subscription('https://push.test/anon', 'k', 'a', null); raise exception 'anon RPC allowed';
  exception when insufficient_privilege then null; end;
  assert not has_table_privilege('anon', 'public.push_subscriptions', 'INSERT,UPDATE,DELETE'), 'anon cannot write';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"36000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ declare n integer; begin
  delete from public.push_subscriptions;
  get diagnostics n = row_count;
  assert n = 1, 'can delete own row';
  raise notice 'PASS: push ownership, reassignment and anonymous isolation';
end $$;
rollback;

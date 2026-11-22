-- Run against a migrated local database only.
begin;
insert into auth.users (id, email, raw_user_meta_data)
values ('28000000-0000-0000-0000-000000000010', 'check-in-test@test.local', '{}');
insert into public.athletes (id, coach_id, first_name, last_name)
values ('28000000-0000-0000-0000-000000000011', '28000000-0000-0000-0000-000000000010', 'Check', 'In');
insert into public.athlete_journal_entries (athlete_id, coach_id, entry_on, sleep_hours, sleep_quality, soreness, stress, energy, mood, soreness_areas, alcohol)
values ('28000000-0000-0000-0000-000000000011', '28000000-0000-0000-0000-000000000010', '2026-11-21', 7.5, 4, 2, 2, 4, 4, array['quads'], true);
select sleep_hours, sleep_quality, soreness, stress, energy, mood, readiness
from public.athlete_journal_entries where athlete_id = '28000000-0000-0000-0000-000000000011';
do $$
begin
  assert (select readiness = 78 from public.athlete_journal_entries where athlete_id = '28000000-0000-0000-0000-000000000011'), 'sample readiness must match readinessScore: 78';
  begin
    update public.athlete_journal_entries set soreness = 6 where athlete_id = '28000000-0000-0000-0000-000000000011';
    raise exception 'soreness 6 should fail';
  exception when check_violation then raise notice 'PASS: soreness 6 rejected';
  end;
  begin
    update public.athlete_journal_entries set soreness_areas = array['invalid'] where athlete_id = '28000000-0000-0000-0000-000000000011';
    raise exception 'unknown areas should fail';
  exception when check_violation then raise notice 'PASS: unknown area rejected';
  end;
  begin
    update public.athlete_journal_entries set soreness_areas = array_fill('quads'::text, array[13]) where athlete_id = '28000000-0000-0000-0000-000000000011';
    raise exception '13 areas should fail';
  exception when check_violation then raise notice 'PASS: 13 areas rejected';
  end;
end $$;
-- Habit-only upsert preserves check-in values.
insert into public.athlete_journal_entries (athlete_id, coach_id, entry_on, alcohol)
values ('28000000-0000-0000-0000-000000000011', '28000000-0000-0000-0000-000000000010', '2026-11-21', false)
on conflict (athlete_id, entry_on) do update set alcohol = excluded.alcohol;
do $$ begin
  assert (select readiness = 78 and not alcohol from public.athlete_journal_entries where athlete_id = '28000000-0000-0000-0000-000000000011'), 'habit update must preserve check-in';
end $$;
update public.athlete_journal_entries set mood = null where athlete_id = '28000000-0000-0000-0000-000000000011';
select readiness as incomplete_readiness from public.athlete_journal_entries where athlete_id = '28000000-0000-0000-0000-000000000011';
do $$ begin
  assert (select readiness is null from public.athlete_journal_entries where athlete_id = '28000000-0000-0000-0000-000000000011'), 'incomplete check-in must have no readiness';
end $$;
rollback;

alter table public.athlete_journal_entries
  add column soreness smallint check (soreness between 1 and 5),
  add column soreness_areas text[] not null default '{}' check (
    cardinality(soreness_areas) <= 12 and
    soreness_areas <@ array['neck','shoulders','upper back','lower back','chest','arms','wrists','core','hips','glutes','quads','hamstrings','knees','calves','ankles/feet']::text[]
  ),
  add column stress smallint check (stress between 1 and 5),
  add column energy smallint check (energy between 1 and 5),
  add column mood smallint check (mood between 1 and 5);

update public.athlete_journal_entries set stress = 4 where high_stress and stress is null;
alter table public.athlete_journal_entries drop column high_stress;

-- Average six normalized recovery parts, then map to 1–100. Incomplete check-ins have no score.
alter table public.athlete_journal_entries add column readiness smallint generated always as (
  case when sleep_hours is null or sleep_quality is null or soreness is null or stress is null or energy is null or mood is null then null
  else round(1 + 99 * (least(sleep_hours, 8) / 8 + (sleep_quality - 1) / 4.0 + (5 - soreness) / 4.0 + (5 - stress) / 4.0 + (energy - 1) / 4.0 + (mood - 1) / 4.0) / 6) end
) stored check (readiness between 1 and 100);

-- Existing table-level grants and RLS cover these columns. The athlete_id, entry_on unique constraint already supplies the index.

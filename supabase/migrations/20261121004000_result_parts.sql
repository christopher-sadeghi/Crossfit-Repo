alter table public.workout_results
  add column parts jsonb not null default '[]'::jsonb
  check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) <= 40);

alter table public.workout_results
  add constraint workout_results_id_athlete_id_key unique (id, athlete_id);

alter table public.benchmark_results
  add column source_result_id uuid;

alter table public.benchmark_results
  add constraint benchmark_results_source_result_id_athlete_id_fkey
  foreign key (source_result_id, athlete_id)
  references public.workout_results(id, athlete_id)
  on delete cascade;

create index benchmark_results_source_result_id_idx
  on public.benchmark_results(source_result_id);

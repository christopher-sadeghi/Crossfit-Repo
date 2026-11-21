-- Newer Supabase projects no longer grant table access to API roles by default.
-- Grant it explicitly; row-level security still limits each coach to their own rows.

grant usage on schema public to authenticated, service_role;

grant select, update on public.coaches to authenticated;
grant select, insert, update, delete on
  public.athletes,
  public.body_metrics,
  public.movements,
  public.programs,
  public.program_assignments,
  public.workouts,
  public.workout_movements,
  public.athlete_workout_scalings,
  public.workout_results,
  public.nutrition_targets,
  public.food_logs,
  public.goals,
  public.ai_suggestions
to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;

-- Only the auth trigger should run this.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="fit23-rls-$$"
trap 'docker rm -f "$container" >/dev/null' EXIT
docker run --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust -d postgres:17 >/dev/null
ready=false
for ((i=0; i<100; i++)); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
done
if [ "$ready" != true ]; then docker logs "$container"; exit 1; fi
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (bucket_id text references storage.buckets, name text, primary key (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select folders[1:cardinality(folders)-1] from string_to_array(name, '/') as folders;
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, delete on storage.objects to authenticated, anon;
SQL
for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -1 < "$migration"
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_isolation.sql
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/movement_demos.sql

-- Simula o mínimo do Supabase num Postgres comum, para testar 001_esquema.sql localmente.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
grant usage on schema public, auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
grant all on storage.objects to authenticated;
grant usage on sequence storage.objects_id_seq to authenticated;

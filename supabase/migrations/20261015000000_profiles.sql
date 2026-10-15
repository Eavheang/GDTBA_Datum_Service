-- One row per auth user holding their app role. Edit `role` in the Table Editor to promote or demote someone.
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

-- Signed-in users may read only their own row. No write policies: only the service (service_role bypasses RLS)
-- and the triggers below change rows, so nobody can promote themselves.
alter table public.profiles enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- Every new auth user (dashboard, API or the app) gets a profile as a plain user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the email column readable in the Table Editor after an email change.
create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Backfill existing users, carrying over any admin role set earlier in app_metadata.
insert into public.profiles (id, email, role)
select
  id,
  coalesce(email, ''),
  case when raw_app_meta_data ->> 'role' = 'admin' then 'admin'::public.app_role else 'user' end
from auth.users
on conflict (id) do nothing;

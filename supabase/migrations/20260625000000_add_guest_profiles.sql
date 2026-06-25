alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  alter column id set default gen_random_uuid(),
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists is_guest boolean not null default false;

update public.profiles
set
  first_name = split_part(display_name, ' ', 1),
  last_name = btrim(regexp_replace(display_name, '^\S+\s*', ''))
where first_name = '';
-- 0001_identity.sql
--
-- Identity and linking: who a user is, what accounts they belong to, and which
-- projects they can reach. Nothing chatbot-specific lives here.
--
-- An account is the owner of projects and is either a person (type 'user') or a
-- business (type 'org'). They share one table and one id space, so "a user owns
-- projects directly" is not a special case anywhere downstream -- it is an
-- account whose type happens to be 'user'. Every foreign key, policy, and query
-- below treats both the same.

create extension if not exists citext;


-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- Mirror of auth.users. Supabase owns auth.users and we cannot add columns to
-- it or point foreign keys at it from every table without granting broad access
-- to the auth schema, so application data hangs off this row instead.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      citext not null,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create type account_type as enum ('user', 'org');
create type account_role as enum ('master_admin', 'admin', 'member');
create type project_role as enum ('admin', 'moderator', 'viewer');

create table public.accounts (
  id           uuid primary key default gen_random_uuid(),
  type         account_type not null,
  -- People and orgs share one slug namespace, so /acme and /hitesh resolve
  -- through a single lookup and can never collide.
  slug         citext not null unique,
  display_name text not null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.account_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       account_role not null default 'member',
  invited_by uuid references public.profiles(id),
  joined_at  timestamptz not null default now(),
  primary key (account_id, user_id)
);

-- "Which accounts am I in" is the most frequent read and is the reverse of the
-- primary key order, so it needs its own index.
create index account_members_user_id_idx on public.account_members (user_id);

-- The master admin is the single controller of an account id. Enforced here
-- rather than trusted to the application, so it can never drift.
--
-- Ownership transfer is demote-then-promote inside one transaction: this index
-- is checked per statement, so passing through zero master admins is fine but
-- passing through two is not.
create unique index one_master_admin_per_account
  on public.account_members (account_id)
  where role = 'master_admin';


-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name       text not null,
  slug       citext not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, slug),
  -- Redundant next to the primary key, but it is the target the composite
  -- foreign key on project_members needs.
  unique (id, account_id)
);

create table public.project_members (
  project_id uuid not null,
  -- Looks redundant beside project_id. It is what makes both foreign keys
  -- below expressible, which together guarantee that a project member is
  -- always a member of that project's account, and that removing someone from
  -- an account removes them from every project it owns.
  account_id uuid not null,
  user_id    uuid not null,
  role       project_role not null default 'viewer',
  added_by   uuid references public.profiles(id),
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, account_id)
    references public.projects(id, account_id) on delete cascade,
  foreign key (account_id, user_id)
    references public.account_members(account_id, user_id) on delete cascade
);

create index project_members_user_id_idx on public.project_members (user_id);


-- ---------------------------------------------------------------------------
-- Rules that make a personal account behave differently from an org
-- ---------------------------------------------------------------------------

create function public.enforce_account_member_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type account_type;
begin
  select type into v_type from accounts where id = new.account_id;

  -- An org has the full ladder. A personal account has its owner and any
  -- collaborators, with no middle tier to delegate control to.
  if v_type = 'user' and new.role = 'admin' then
    raise exception 'personal accounts cannot have admins';
  end if;

  -- A person controls exactly one personal account: their own. They may still
  -- be a collaborator on someone else's.
  if v_type = 'user' and new.role = 'master_admin' and exists (
    select 1
    from account_members m
    join accounts a on a.id = m.account_id
    where m.user_id = new.user_id
      and m.role = 'master_admin'
      and a.type = 'user'
      and m.account_id <> new.account_id
  ) then
    raise exception 'user % already controls a personal account', new.user_id;
  end if;

  return new;
end $$;

create trigger enforce_account_member_rules
  before insert or update on public.account_members
  for each row execute function public.enforce_account_member_rules();


-- An account must never be left without a controller. AFTER DELETE rather than
-- BEFORE, so that a cascade from a deleted account is visibly a cascade and is
-- allowed through instead of aborting the parent delete.
--
-- Only DELETE is guarded. A demoting UPDATE is how ownership transfer starts,
-- so blocking it here would make transfer impossible.
create function public.protect_last_master_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'master_admin' then
    return null;
  end if;

  if not exists (select 1 from accounts where id = old.account_id) then
    return null;
  end if;

  if not exists (
    select 1 from account_members
    where account_id = old.account_id and role = 'master_admin'
  ) then
    raise exception 'cannot remove the last master admin of account %',
      old.account_id;
  end if;

  return null;
end $$;

create trigger protect_last_master_admin
  after delete on public.account_members
  for each row execute function public.protect_last_master_admin();


-- ---------------------------------------------------------------------------
-- Signup
-- ---------------------------------------------------------------------------

create function public.generate_account_slug(p_base text)
returns citext
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base  text;
  v_slug  citext;
  v_n     int := 0;
begin
  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_base, '')),
                                              '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'user';
  end if;
  v_base := left(v_base, 32);

  v_slug := v_base;
  while exists (select 1 from accounts where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  return v_slug;
end $$;


-- Fires once per signup. Anything that raises in here blocks the signup
-- entirely, so it stays defensive and does only what must exist before the user
-- can load the app: their profile and the personal account that owns whatever
-- they create on their own.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_name    text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  if exists (
    select 1 from account_members m
    join accounts a on a.id = m.account_id
    where m.user_id = new.id and a.type = 'user' and m.role = 'master_admin'
  ) then
    return new;
  end if;

  -- generate_account_slug reads then writes, so two signups from the same email
  -- local part can pick the same slug. Retry rather than fail the signup.
  for i in 1..5 loop
    begin
      insert into accounts (type, slug, display_name)
      values ('user', generate_account_slug(split_part(new.email, '@', 1)), v_name)
      returning id into v_account;
      exit;
    exception when unique_violation then
      v_account := null;
    end;
  end loop;

  if v_account is null then
    raise exception 'could not allocate a personal account slug for %', new.email;
  end if;

  insert into account_members (account_id, user_id, role)
  values (v_account, new.id, 'master_admin');

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Org creation is an RPC rather than a direct insert because the account row
-- and its master admin row must land together -- an org with no controller is
-- unreachable. Used for every org; personal accounts come from the trigger.
create function public.create_organization(p_name text, p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  if auth.uid() is null then
    raise exception 'create_organization requires an authenticated caller';
  end if;

  insert into accounts (type, slug, display_name)
  values ('org', generate_account_slug(coalesce(p_slug, p_name)), p_name)
  returning id into v_account;

  insert into account_members (account_id, user_id, role)
  values (v_account, auth.uid(), 'master_admin');

  return v_account;
end $$;


-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
--
-- All security definer, which is not decoration: a policy on account_members
-- that itself reads account_members recurses and fails at runtime. Running the
-- lookup inside a definer function bypasses RLS for that read and breaks the
-- cycle. The explicit search_path is what stops these from being a privilege
-- escalation path.

create function public.is_account_member(p_account uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from account_members
    where account_id = p_account and user_id = auth.uid()
  );
$$;

create function public.is_account_admin(p_account uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from account_members
    where account_id = p_account and user_id = auth.uid()
      and role in ('master_admin', 'admin')
  );
$$;

create function public.is_account_master(p_account uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from account_members
    where account_id = p_account and user_id = auth.uid()
      and role = 'master_admin'
  );
$$;

create function public.shares_account_with(p_user uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from account_members mine
    join account_members theirs on theirs.account_id = mine.account_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

-- Account admins reach every project the account owns. Plain members reach only
-- the ones they were explicitly added to -- that is the moderator case.
create function public.can_read_project(p_project uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from projects p
    where p.id = p_project
      and p.deleted_at is null
      and (
        is_account_admin(p.account_id)
        or exists (
          select 1 from project_members m
          where m.project_id = p.id and m.user_id = auth.uid()
        )
      )
  );
$$;

create function public.can_write_project(p_project uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from projects p
    where p.id = p_project
      and p.deleted_at is null
      and (
        is_account_admin(p.account_id)
        or exists (
          select 1 from project_members m
          where m.project_id = p.id and m.user_id = auth.uid()
            and m.role = 'admin'
        )
      )
  );
$$;


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.accounts         enable row level security;
alter table public.account_members  enable row level security;
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;

-- profiles: yourself, and anyone you share an account with, so member lists can
-- render names. No insert policy -- rows come from the signup trigger only.
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or shares_account_with(id));

create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- accounts: no insert policy either. Both paths go through a definer function
-- so an account can never exist without a master admin.
create policy accounts_select on public.accounts
  for select using (is_account_member(id));

create policy accounts_update on public.accounts
  for update using (is_account_admin(id)) with check (is_account_admin(id));

create policy accounts_delete on public.accounts
  for delete using (type = 'org' and is_account_master(id));

create policy account_members_select on public.account_members
  for select using (is_account_member(account_id));

create policy account_members_write on public.account_members
  for all using (is_account_admin(account_id))
  with check (is_account_admin(account_id));

create policy projects_select on public.projects
  for select using (can_read_project(id));

create policy projects_insert on public.projects
  for insert with check (is_account_admin(account_id));

create policy projects_update on public.projects
  for update using (can_write_project(id))
  with check (can_write_project(id));

create policy projects_delete on public.projects
  for delete using (is_account_admin(account_id));

create policy project_members_select on public.project_members
  for select using (can_read_project(project_id));

create policy project_members_write on public.project_members
  for all using (can_write_project(project_id))
  with check (can_write_project(project_id));


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- RLS decides which rows; these decide who may attempt a statement at all.
-- anon gets nothing: every table here is behind a session.

grant select, insert, update, delete on
  public.profiles, public.accounts, public.account_members,
  public.projects, public.project_members
  to authenticated;

revoke execute on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

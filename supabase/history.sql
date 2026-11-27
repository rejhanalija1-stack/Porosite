-- Server-side safety net: keeps a copy of every place/day document before it is changed or
-- deleted, so data can always be recovered, whatever any app version does.
-- Run in the Supabase dashboard -> SQL Editor. It only ADDS a table and triggers; it changes no data.

-- STEP 1. Find the table the app's functions write to (look for "update"/"delete from <table>"):
select proname, prosrc from pg_proc where proname in ('kv_set', 'kv_del', 'kv_list');

-- STEP 2. Replace every  public.kv  below with that table name, then run the rest.

create table if not exists public.kv_history (
  hid     bigserial primary key,
  at      timestamptz not null default now(),
  op      text        not null,   -- 'UPDATE' or 'DELETE'
  tbl     text        not null,
  old_row jsonb       not null    -- the row exactly as it was before the change
);
-- No policies: the history is invisible to the app's public key; only the dashboard/SQL sees it.
alter table public.kv_history enable row level security;

create or replace function public.kv_keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.kv_history (op, tbl, old_row) values (tg_op, tg_table_name, to_jsonb(old));
  return null;
end $$;

drop trigger if exists kv_history_delete on public.kv;
create trigger kv_history_delete after delete on public.kv
  for each row execute function public.kv_keep_history();

drop trigger if exists kv_history_update on public.kv;
create trigger kv_history_update after update on public.kv
  for each row when (old is distinct from new) execute function public.kv_keep_history();

-- ---------------------------------------------------------------------------------------------
-- RECOVERY (examples)
-- Everything deleted in the last 2 days:
--   select at, old_row from public.kv_history where op = 'DELETE' and at > now() - interval '2 days' order by at;
-- Put deleted rows back (check the column list against your table first):
--   insert into public.kv select (jsonb_populate_record(null::public.kv, old_row)).*
--   from public.kv_history where op = 'DELETE' and at > now() - interval '2 days'
--   on conflict do nothing;
-- Housekeeping, keep 180 days:
--   delete from public.kv_history where at < now() - interval '180 days';

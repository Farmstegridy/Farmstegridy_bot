-- Apply only after rotating the exposed privileged key and securing existing user tables.
-- Existing profiles are not altered and no consent is inferred from membership.
begin;
create table if not exists public.bot_contact_preferences (
  telegram_user_id text not null check (telegram_user_id ~ '^[0-9]+$'),
  telegram_bot_id text not null check (telegram_bot_id ~ '^[0-9]+$'),
  service_contact_allowed boolean not null default false,
  policy_version text not null,
  decided_at timestamptz not null default now(),
  primary key (telegram_user_id, telegram_bot_id)
);
alter table public.bot_contact_preferences enable row level security;
revoke all on table public.bot_contact_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.bot_contact_preferences to service_role;
commit;

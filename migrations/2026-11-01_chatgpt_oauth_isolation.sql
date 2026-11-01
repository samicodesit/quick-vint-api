-- Install before enabling OAuth. Do not grant this role to authenticator:
-- OAuth JWTs must fail PostgREST SET ROLE rather than reach application data.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='autolister_plugin') then
    create role autolister_plugin nologin noinherit;
  end if;
end $$;
revoke autolister_plugin from authenticator;

create or replace function public.autolister_oauth_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare claims jsonb := event->'claims';
begin
  if nullif(claims->>'client_id','') is not null then
    claims := jsonb_set(claims,'{role}','"autolister_plugin"'::jsonb);
    claims := jsonb_set(claims,'{autolister_resource}','"https://autolister.app/api/chatgpt/mcp"'::jsonb);
  end if;
  return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.autolister_oauth_token_hook(jsonb) from public,anon,authenticated;
grant execute on function public.autolister_oauth_token_hook(jsonb) to supabase_auth_admin;

-- Deliberately does not enable the hook or OAuth. Verify direct account sessions,
-- OAuth role, resource binding, and the provider's actual JWT before release.

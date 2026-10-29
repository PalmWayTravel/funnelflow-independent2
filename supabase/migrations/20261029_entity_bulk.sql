-- Tömeges műveletek és csoportosítás a Base44-kompatibilis entitás API-hoz.
-- Mind SECURITY INVOKER: a sorszintű jogosultság (RLS) a hívóra érvényes.

create or replace function public.entity_aggregate(
  p_entity text, p_filter jsonb default '{}'::jsonb, p_group_by text default null,
  p_sum text[] default '{}', p_limit integer default 100)
returns jsonb language plpgsql set search_path to 'public' as $$
declare t text; res jsonb; q text; sums text := ''; s text; gexpr text; gsel text;
begin
  t := private.entity_table(p_entity);
  foreach s in array coalesce(p_sum, '{}') loop
    if s !~ '^[a-zA-Z0-9_]+$' then raise exception 'bad_field' using errcode='22023'; end if;
    sums := sums || format(', coalesce(sum(case when jsonb_typeof(x.data->%L)=''number'' then (x.data->>%L)::numeric end),0) as %I', s, s, 'sum_' || s);
  end loop;
  if p_group_by is not null then
    if p_group_by !~ '^[a-zA-Z0-9_]+$' then raise exception 'bad_field' using errcode='22023'; end if;
    gexpr := format('x.data->>%L', p_group_by);
    gsel := format('%s as %I, ', gexpr, p_group_by);
    q := format($f$select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from (
        select %s count(*)::int as count %s from public.%I x where %s group by %s order by count(*) desc limit %s) g$f$,
        gsel, sums, t, private.build_where(p_filter), gexpr, least(greatest(coalesce(p_limit,100),1),1000));
  else
    q := format($f$select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from (
        select count(*)::int as count %s from public.%I x where %s) g$f$, sums, t, private.build_where(p_filter));
  end if;
  execute q into res;
  return jsonb_build_object('rows', res);
end $$;

create or replace function public.entity_delete_many(p_entity text, p_filter jsonb default '{}'::jsonb)
returns integer language plpgsql set search_path to 'public' as $$
declare t text; n integer;
begin
  t := private.entity_table(p_entity);
  execute format('with d as (delete from public.%I x where %s returning 1) select count(*) from d', t, private.build_where(p_filter)) into n;
  return n;
end $$;

-- p_patch: sima mezők összefésülése; "$set" kulcs esetén annak tartalma
create or replace function public.entity_update_many(p_entity text, p_filter jsonb, p_patch jsonb)
returns integer language plpgsql set search_path to 'public' as $$
declare t text; n integer; patch jsonb := coalesce(p_patch->'$set', p_patch);
begin
  t := private.entity_table(p_entity);
  execute format('with u as (update public.%I x set data = x.data || private.strip_meta(%L::jsonb) where %s returning 1) select count(*) from u',
    t, patch::text, private.build_where(p_filter)) into n;
  return n;
end $$;

revoke execute on function public.entity_aggregate(text,jsonb,text,text[],integer) from public, anon;
revoke execute on function public.entity_delete_many(text,jsonb) from public, anon;
revoke execute on function public.entity_update_many(text,jsonb,jsonb) from public, anon;
grant execute on function public.entity_aggregate(text,jsonb,text,text[],integer) to authenticated;
grant execute on function public.entity_delete_many(text,jsonb) to authenticated;
grant execute on function public.entity_update_many(text,jsonb,jsonb) to authenticated;

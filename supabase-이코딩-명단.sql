-- =========================================================
-- 이코딩 학생 명단 파일로 재원생 명단 맞추기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   선생님 화면에서 이코딩 파일을 올려 명단을 맞출 수 있게 합니다.
--     · admin_preview_students — 아무것도 바꾸지 않고 무엇이 달라지는지만 보여 줍니다
--     · admin_sync_students    — 실제로 맞춥니다 (sync_students 를 대신 불러 줍니다)
--
--   둘 다 원장 선생님(role = 'admin')만 쓸 수 있습니다.
--   화면에서 감추는 것으로 끝내지 않고 서버에서도 막습니다.
-- =========================================================


-- ---------------------------------------------------------
-- 1. 미리보기 — 바꾸기 전에 무엇이 달라지는지 보여 줍니다
--
--    kind 에 '들어옴' · '돌아옴' · '나감' · '반 바뀜' 이 적힙니다.
--    '반 바뀜' 일 때 was 에 예전 반이 들어갑니다.
-- ---------------------------------------------------------
create or replace function public.admin_preview_students(pass text, roster jsonb)
returns table (kind text, name text, school text, memo text, was text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.teacher_role(pass) <> 'admin' then
    raise exception '재원생 명단은 원장 선생님만 맞출 수 있습니다';
  end if;

  if roster is null or jsonb_typeof(roster) <> 'array' or jsonb_array_length(roster) = 0 then
    raise exception '명단이 비어 있습니다';
  end if;

  return query
  with incoming as (
    select
      btrim(regexp_replace(coalesce(it->>'name', ''), '[A-Za-z]+$', ''))   as nm,
      nullif(btrim(coalesce(it->>'school', '')), '')                       as sch,
      nullif(btrim(coalesce(it->>'memo', '')), '')                         as mm,
      lower(regexp_replace(
        btrim(regexp_replace(coalesce(it->>'name', ''), '[A-Za-z]+$', '')),
        '\s', '', 'g'))                                                    as nk,
      right(regexp_replace(coalesce(it->>'parent_phone', ''), '[^0-9]', '', 'g'), 4) as p4
    from jsonb_array_elements(roster) it
    where btrim(coalesce(it->>'name', '')) <> ''
  )
  select * from (
    -- 아예 처음 보는 학생
    select '들어옴'::text, i.nm, i.sch, i.mm, null::text
      from incoming i
     where not exists (select 1 from public.students s
                        where s.name_key = i.nk and s.parent_phone4 = i.p4)
    union all
    -- 나갔다가 돌아온 학생 (기록이 그대로 이어집니다)
    select '돌아옴'::text, i.nm, i.sch, i.mm, null::text
      from incoming i
      join public.students s on s.name_key = i.nk and s.parent_phone4 = i.p4
     where not s.active
    union all
    -- 파일에 없어서 명단에서 내려갈 학생 (지우지 않습니다)
    select '나감'::text, s.name, s.school, s.memo, null::text
      from public.students s
     where s.active
       and coalesce(s.memo, '') not like '선생님%'
       and not exists (select 1 from incoming i
                        where i.nk = s.name_key and i.p4 = s.parent_phone4)
    union all
    -- 반이 달라지는 학생
    select '반 바뀜'::text, s.name, s.school, i.mm, s.memo
      from public.students s
      join incoming i on i.nk = s.name_key and i.p4 = s.parent_phone4
     where s.active
       and coalesce(s.memo, '') is distinct from i.mm
  ) t(kind, name, school, memo, was)
  order by t.kind, t.name;
end;
$$;

revoke all on function public.admin_preview_students(text, jsonb) from public;
grant execute on function public.admin_preview_students(text, jsonb) to anon;


-- ---------------------------------------------------------
-- 2. 실제로 맞추기
--
--    sync_students 는 학생 앱에서 부를 수 없게 막아 두었으므로,
--    비밀번호를 확인한 뒤 대신 불러 줍니다.
-- ---------------------------------------------------------
create or replace function public.admin_sync_students(pass text, roster jsonb)
returns table (added int, updated int, left_out int, came_back int, total_active int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.teacher_role(pass) <> 'admin' then
    raise exception '재원생 명단은 원장 선생님만 맞출 수 있습니다';
  end if;

  return query select * from public.sync_students(roster);
end;
$$;

revoke all on function public.admin_sync_students(text, jsonb) from public;
grant execute on function public.admin_sync_students(text, jsonb) to anon;

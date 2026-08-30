-- =========================================================
-- 구글 시트 '재원생' 탭의 변동을 반영하기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   시트의 현재 재원생 명단을 통째로 받아서 수파베이스와 맞춥니다.
--     · 시트에 새로 있는 학생  → 추가
--     · 시트에서 사라진 학생   → 재원생에서 내림 (지우지 않습니다)
--     · 다시 나타난 학생       → 재원생으로 복귀
--
--   ※ 학생을 삭제하지 않습니다. 시험 기록은 그대로 남습니다.
-- =========================================================

alter table public.students add column if not exists left_at     timestamptz;  -- 명단에서 빠진 시점
alter table public.students add column if not exists rejoined_at timestamptz;  -- 다시 돌아온 시점
alter table public.students add column if not exists synced_at   timestamptz;  -- 마지막으로 맞춘 시점

create or replace function public.sync_students(roster jsonb)
returns table (added int, updated int, left_now int, rejoined int, total_active int)
language plpgsql
security definer
set search_path = public
as $$
declare
  a int := 0; u int := 0; l int := 0; r int := 0;
begin
  -- 실수로 빈 명단을 넣어 전체가 사라지는 것을 막습니다
  if roster is null or jsonb_typeof(roster) <> 'array' or jsonb_array_length(roster) = 0 then
    raise exception '명단이 비어 있습니다. 실수로 전체가 사라지는 것을 막기 위해 중단합니다';
  end if;

  create temp table _incoming on commit drop as
  select
    btrim(regexp_replace(coalesce(it->>'name', ''), '[A-Za-z]+$', ''))  as name,
    nullif(btrim(coalesce(it->>'school', '')), '')                     as school,
    nullif(btrim(coalesce(it->>'parent_phone', '')), '')               as parent_phone,
    nullif(btrim(coalesce(it->>'student_phone', '')), '')              as student_phone,
    nullif(btrim(coalesce(it->>'memo', '')), '')                       as memo
  from jsonb_array_elements(roster) it
  where btrim(coalesce(it->>'name', '')) <> '';

  alter table _incoming add column name_key text;
  alter table _incoming add column phone4   text;
  update _incoming
     set name_key = lower(regexp_replace(name, '\s', '', 'g')),
         phone4   = right(regexp_replace(coalesce(parent_phone, ''), '[^0-9]', '', 'g'), 4);

  with up as (
    insert into public.students (name, school, parent_phone, student_phone, memo, active, synced_at)
    select name, school, parent_phone, student_phone, memo, true, now() from _incoming
    on conflict (name_key, parent_phone4) do update set
      name          = excluded.name,
      school        = excluded.school,
      parent_phone  = excluded.parent_phone,
      student_phone = excluded.student_phone,
      memo          = excluded.memo,
      active        = true,
      rejoined_at   = case when public.students.active = false then now() else public.students.rejoined_at end,
      left_at       = case when public.students.active = false then null   else public.students.left_at end,
      synced_at     = now()
    returning (xmax = 0) as is_new,
              (rejoined_at is not null and rejoined_at > now() - interval '1 minute') as came_back
  )
  select count(*) filter (where is_new),
         count(*) filter (where not is_new),
         count(*) filter (where came_back and not is_new)
    into a, u, r
    from up;

  with gone as (
    update public.students s
       set active = false,
           left_at = coalesce(s.left_at, now())
     where s.active
       and not exists (select 1 from _incoming i
                        where i.name_key = s.name_key and i.phone4 = s.parent_phone4)
    returning 1
  )
  select count(*) into l from gone;

  return query
    select a, u, l, r, (select count(*)::int from public.students where active);
end;
$$;

-- 이 함수는 선생님만 씁니다. 학생 앱에서는 부를 수 없게 막아 둡니다.
revoke all on function public.sync_students(jsonb) from public;
revoke all on function public.sync_students(jsonb) from anon, authenticated;

-- 재원생에서 내려온 학생들 (기록은 그대로 남아 있습니다)
create or replace view public.former_students as
select s.name                             as 이름,
       s.school                           as 학교,
       s.memo                             as 마지막반,
       s.parent_phone                     as 학부모연락처,
       s.left_at                          as 나간시점,
       count(a.id)                        as 남은시험기록,
       coalesce(round(avg(a.percent)), 0) as 평균정답률,
       max(a.taken_at)                    as 마지막응시
  from public.students s
  left join public.quiz_attempts a on a.student_id = s.id
 where not s.active
 group by s.id, s.name, s.school, s.memo, s.parent_phone, s.left_at
 order by s.left_at desc nulls last;


-- =========================================================
-- 재원생에서 내려온 학생 보기:
--   select * from public.former_students;
--
-- 다시 재원생으로 올리기 (시트에 다시 넣고 동기화해도 됩니다):
--   update public.students set active = true, left_at = null
--    where name = '학생이름';
-- =========================================================

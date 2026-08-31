-- =========================================================
-- 반(고등부 / 중등부) 나누기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   1) 재원생 명단에 '반' 칸을 만듭니다. (고등부 / 중등부)
--      비워 두면 메모의 첫 글자로 짐작합니다. (중1·중2·중3 -> 중등부)
--   2) 학생이 이름을 넣으면 '재원생이 맞다 + 어느 반이다' 를 알려 줍니다.
--      명단 자체는 여전히 밖으로 나가지 않습니다.
--   3) 이번 주 숙제 회차를 반마다 따로 정할 수 있게 합니다.
--   4) 시트에서 명단을 맞출 때 반도 함께 맞춥니다.
--   5) 선생님 화면의 학생 목록에 반이 함께 나옵니다.
--
-- ※ 먼저 supabase-학생명단.sql, supabase-숙제회차.sql,
--    supabase-재원생확인.sql, supabase-선생님.sql 을 실행해 두어야 합니다.
-- =========================================================


-- ---------------------------------------------------------
-- 1) 명단에 '반' 칸 만들기
-- ---------------------------------------------------------
alter table public.students add column if not exists grade_group text;


-- 반이 비어 있을 때 메모를 보고 짐작합니다.
-- 메모가 '중' 으로 시작하면 중등부, 그 밖에는 모두 고등부입니다.
create or replace function public.guess_group(memo text)
returns text
language sql
immutable
as $$
  select case
           when btrim(coalesce(memo, '')) like '중%' then '중등부'
           else '고등부'
         end;
$$;


-- ---------------------------------------------------------
-- 2) 재원생 확인 + 그 학생의 반 알려주기
--
--    돌려주는 값은 이런 모양입니다.
--      {"ok": true,  "group": "고등부"}   재원생이 맞습니다
--      {"ok": false, "group": ""}         명단에 없습니다
-- ---------------------------------------------------------
create or replace function public.check_enrolled_group(student_name text, phone4 text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
              'ok', true,
              'group', coalesce(nullif(btrim(s.grade_group), ''), public.guess_group(s.memo)))
       from public.students s
      where s.active
        and s.name_key = lower(regexp_replace(coalesce(student_name, ''), '\s', '', 'g'))
        and s.parent_phone4 = regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g')
        and regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g') <> ''
        and coalesce(s.name_key, '') <> ''
      limit 1),
    jsonb_build_object('ok', false, 'group', ''));
$$;

revoke all on function public.check_enrolled_group(text, text) from public;
grant execute on function public.check_enrolled_group(text, text) to anon;


-- ---------------------------------------------------------
-- 3) 이번 주 숙제 회차를 반마다 따로 정하기
--
--    설정 이름이 반마다 나뉩니다.
--      homework_round:고등부
--      homework_round:중등부
-- ---------------------------------------------------------

-- 학생 앱이 반별 숙제 회차를 읽을 수 있게 합니다
drop policy if exists "숙제 회차만 읽기" on public.app_settings;

create policy "숙제 회차만 읽기"
  on public.app_settings for select to anon
  using (key like 'homework_round%');

insert into public.app_settings (key, value)
values ('homework_round:고등부', ''), ('homework_round:중등부', '')
on conflict (key) do nothing;

-- 반을 나누기 전에 정해 둔 값이 있으면 고등부로 옮겨 둡니다
update public.app_settings a
   set value = old.value, updated_at = now()
  from public.app_settings old
 where a.key = 'homework_round:고등부'
   and old.key = 'homework_round'
   and coalesce(a.value, '') = ''
   and coalesce(old.value, '') <> '';


-- 선생님용: 비밀번호가 맞을 때만 그 반의 숙제 회차를 바꿉니다
create or replace function public.set_homework_round(pass text, round text, grade_group text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  grp text := nullif(btrim(coalesce(grade_group, '')), '');
begin
  if not exists (select 1 from public.admin_secret where password = pass) then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;

  if grp is null then
    raise exception '반을 고르지 않았습니다';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('homework_round:' || grp, coalesce(round, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return coalesce(round, '');
end;
$$;

revoke all on function public.set_homework_round(text, text, text) from public;
grant execute on function public.set_homework_round(text, text, text) to anon;

-- 반을 안 쓰던 옛 기능은 없앱니다 (반을 꼭 고르게 하려는 것입니다)
drop function if exists public.set_homework_round(text, text);


-- ---------------------------------------------------------
-- 4) 시트에서 명단을 맞출 때 반도 함께 맞추기
--
--    시트에 'grade_group' 칸을 두면 그 값을 씁니다.
--    칸이 없거나 비어 있으면 메모를 보고 짐작합니다.
-- ---------------------------------------------------------
create or replace function public.sync_students(roster jsonb)
returns table (added int, updated int, left_out int, came_back int, total_active int)
language plpgsql
security definer
set search_path = public
as $$
declare
  a int := 0; u int := 0; l int := 0; r int := 0;
begin
  create temp table _incoming on commit drop as
  select
    btrim(coalesce(it->>'name', ''))                                   as name,
    nullif(btrim(coalesce(it->>'school', '')), '')                     as school,
    nullif(btrim(coalesce(it->>'parent_phone', '')), '')               as parent_phone,
    nullif(btrim(coalesce(it->>'student_phone', '')), '')              as student_phone,
    nullif(btrim(coalesce(it->>'memo', '')), '')                       as memo,
    coalesce(nullif(btrim(coalesce(it->>'grade_group', '')), ''),
             public.guess_group(it->>'memo'))                          as grade_group
  from jsonb_array_elements(roster) it
  where btrim(coalesce(it->>'name', '')) <> '';

  alter table _incoming add column name_key text;
  alter table _incoming add column phone4   text;
  update _incoming
     set name_key = lower(regexp_replace(name, '\s', '', 'g')),
         phone4   = right(regexp_replace(coalesce(parent_phone, ''), '[^0-9]', '', 'g'), 4);

  with up as (
    insert into public.students (name, school, parent_phone, student_phone, memo, grade_group, active, synced_at)
    select name, school, parent_phone, student_phone, memo, grade_group, true, now() from _incoming
    on conflict (name_key, parent_phone4) do update set
      name          = excluded.name,
      school        = excluded.school,
      parent_phone  = excluded.parent_phone,
      student_phone = excluded.student_phone,
      memo          = excluded.memo,
      grade_group   = excluded.grade_group,
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

  -- 시트에서 빠진 학생은 지우지 않고 내려놓기만 합니다 (기록은 그대로 남습니다)
  update public.students s
     set active = false, left_at = coalesce(s.left_at, now())
   where s.active
     and not exists (
       select 1 from _incoming i
        where i.name_key = s.name_key and i.phone4 = s.parent_phone4);
  get diagnostics l = row_count;

  return query
    select a, u, l, r, (select count(*)::int from public.students where active);
end;
$$;

revoke all on function public.sync_students(jsonb) from public;
revoke all on function public.sync_students(jsonb) from anon, authenticated;


-- ---------------------------------------------------------
-- 5) 선생님 화면의 학생 목록에 반 넣기
-- ---------------------------------------------------------
drop function if exists public.admin_students(text);

create or replace function public.admin_students(pass text)
returns table (
  name          text,
  school        text,
  parent_phone  text,
  student_phone text,
  class_name    text,   -- 반 (memo 에 적은 값)
  grade         text,   -- 반 이름 앞부분에서 뽑은 학년 (예: 고2)
  grade_group   text,   -- 고등부 / 중등부
  active        boolean,
  attempts      bigint,
  rounds_done   bigint,
  avg_percent   numeric,
  last_taken    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_secret where password = pass) then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;

  return query
    select s.name, s.school, s.parent_phone, s.student_phone,
           s.memo,
           coalesce(nullif(split_part(coalesce(s.memo, ''), ' ', 1), ''), '미분류'),
           coalesce(nullif(btrim(s.grade_group), ''), public.guess_group(s.memo)),
           s.active,
           count(a.id),
           count(distinct a.round_title),
           coalesce(round(avg(a.percent)), 0),
           max(a.taken_at)
      from public.students s
      left join public.quiz_attempts a on a.student_id = s.id
     where coalesce(s.memo, '') not like '선생님%'   -- 선생님 계정은 통계에서 뺍니다
     group by s.id, s.name, s.school, s.parent_phone, s.student_phone, s.memo, s.grade_group, s.active
     order by s.name;
end;
$$;

revoke all on function public.admin_students(text) from public;
grant execute on function public.admin_students(text) to anon;


-- =========================================================
-- 확인해 보기
--
--   -- 어느 학생의 반 보기
--   select public.check_enrolled_group('홍길동', '1234');
--
--   -- 반별 숙제 회차 보기
--   select key, value from public.app_settings where key like 'homework_round%';
--
--   -- 학생 한 명의 반을 손으로 바꾸기
--   update public.students set grade_group = '중등부' where name = '홍길동';
-- =========================================================
